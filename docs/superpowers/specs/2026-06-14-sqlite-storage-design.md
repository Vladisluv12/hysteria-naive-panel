# SQLite Storage Backend — Design Spec

## Goal

Добавить опциональный SQLite-бэкенд для панели управления, переключаемый runtime через `USE_SQLITE` env. При включении — dual-write в SQLite + JSON, при выключении — только JSON. Миграция данных между форматами автоматическая и безопасная.

## Motivation

- JSON-файлы не имеют row-level locking — race condition в `updateConfig` решены reload-до-save, но это костыль
- SQLite даёт транзакционность, конкурентность, целостность — и умирает от `kill -9` не теряя данные
- На 1 ядре / 2GB RAM SQLite работает с overhead ~5MB RAM, idle CPU = 0

## Constraints

- **Dual-write при SQLite**: каждая `saveConfig`/`saveUsers` пишет и в SQLite, и в JSON
- **Выключение SQLite**: при `USE_SQLITE=false` JSON уже свежий (dual-write держал), просто читаем/пишем JSON
- **Первое включение SQLite**: если SQLite пуст — импорт из JSON
- **Данные НЕ удаляются** при переключениях — безопасный откат в любой момент
- `storage.js` (JSON) остаётся без изменений для обратной совместимости

## Architecture

```
controllers / index.js
        |
        v
  storageFactory.js        ← выбирает бэкенд по USE_SQLITE
     /           \
    v             v
storage.js    sqliteStorage.js
(JSON files)  (better-sqlite3)
```

`storageFactory` экспортирует тот же API: `{ loadConfig, saveConfig, loadUsers, saveUsers, defaultConfig }`.

## SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

Две записи:
- `key='config'`, `value=JSON.stringify(config)`
- `key='users'`,  `value=JSON.stringify(users)` — users как объект (те же данные)

## sqliteStorage.js API

Повторяет `storage.js` сигнатуру один-в-один:

```js
function loadConfig()    // → object
function saveConfig(cfg) // void
function loadUsers()     // → object { username: { password, role } }
function saveUsers(usr)  // void
function defaultConfig() // → object (делегирует storage.js)
```

**На уровне модуля (при require):**
1. Если `better-sqlite3` не загружается — выбросить ошибку
2. Открыть `data/panel.db`, создать таблицу `meta`
3. Вызвать `syncFromJsonIfNeeded()` — перенести из JSON в SQLite если SQLite пуст, но JSON есть

## Dual-Write Strategy

```
saveConfig(cfg):
  1. // Dual-write если USE_SQLITE=true
  2. upsert meta SET value=? WHERE key='config'
  3. saveConfigJson(cfg) // всегда пишем в JSON
```

При `USE_SQLITE=true`:
- **read**: читаем из SQLite (`loadConfig` → `SELECT value FROM meta WHERE key='config'`)
- **write**: пишем в SQLite + JSON (`saveConfig` → `INSERT OR REPLACE` + `fs.writeFileSync`)

При `USE_SQLITE=false`:
- **read/write**: делегируем `storage.js` (чистый JSON)

**Sync at startup** (только при `USE_SQLITE=true`):
1. `db.prepare("SELECT value FROM meta WHERE key='config'").get()` — есть данные?
2. **Нет** → читаем `storage.loadConfig()`, пишем в SQLite.
3. **Да** → считаем SQLite source of truth, JSON обновится при следующем `saveConfig`.

## Data Safety & Recovery

- SQLite WAL mode — читатели не блокируют писателей
- `data/` содержит `config.json`, `users.json`, `panel.db` — можно удалить любой файл, восстановится при старте
- При падении `better-sqlite3` при `require` — логируем ошибку, падаем с process.exit (чтобы не было работы "в никуда")

## Install Script Changes

1. `package.json`: `better-sqlite3` в `dependencies`
2. Вопрос после выбора протоколов:
   ```
   Использовать SQLite для хранения данных?
   [Y] Да (рекомендуется) — транзакционность, синхронизация с JSON
   [n] Нет — только JSON-файлы (меньше зависимостей)
   ```
3. Запись `USE_SQLITE=true/false`:
   - Через `Environment=USE_SQLITE=...` в systemd-юните
   - Либо через `/etc/rixxx-panel/env` файл

## Files

| Файл | Изменение |
|------|-----------|
| `panel/server/services/sqliteStorage.js` | **Новый** — SQLite-бэкенд |
| `panel/server/services/storageFactory.js` | **Новый** — выбор бэкенда |
| `panel/server/index.js` | import меняется на `storageFactory` |
| `panel/server/controllers/authController.js` | import меняется на `storageFactory` |
| `panel/server/controllers/naiveController.js` | import меняется на `storageFactory` |
| `panel/server/controllers/hysteriaController.js` | import меняется на `storageFactory` |
| `panel/server/controllers/systemController.js` | import меняется на `storageFactory` |
| `panel/server/controllers/diagController.js` | import меняется на `storageFactory` |
| `panel/server/services/atomicUpdate.js` | import меняется на `storageFactory` |
| `panel/package.json` | add `better-sqlite3` dependency |
| `install.sh` | вопрос про SQLite + systemd env |

## Testing

- `server/__tests__/sqliteStorage.test.js` — 10-15 тестов:
  - loadConfig/saveConfig roundtrip
  - loadUsers/saveUsers roundtrip
  - импорт из JSON при пустой SQLite
  - dual-write ведёт в оба хранилища
  - schema-less: config/naiveUsers/hy2Users сохраняются корректно
  - `defaultConfig()` возвращает эталон
- `storageFactory.test.js` — проверяет выбор бэкенда по `USE_SQLITE`
- Все существующие тесты (unit 72 + integration 17) должны проходить без изменений

## Rollout

1. `npm install better-sqlite3` — обычная зависимость
2. На существующих установках: `USE_SQLITE` не задан → JSON как было
3. Новые установки через install.sh: вопрос → `USE_SQLITE=true` в systemd unit
