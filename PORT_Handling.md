# Port Handling — Naive + Hysteria2 Panel

## Статус: ИСПРАВЛЕНО

Порт читается из `config.json` поля `port`. `defaultConfig()` всегда задаёт `port: 443`.

---

## Что было исправлено

### Бэкенд

| Файл | Что изменено |
|------|-------------|
| `panel/server/services/storage.js:26` | `defaultConfig()` — `port: 443` |
| `panel/server/services/storage.js:52-55` | Валидация `port` при загрузке (корректный или `443`) |
| `panel/server/services/sqliteStorage.js:40` | `defaultConfig()` — `port: 443` |
| `panel/server/services/sqliteStorage.js:53-56` | Валидация `port` при загрузке |
| `panel/server/services/configBuilder.js:23,68` | Caddyfile: `:${cfg.port}`, Hy2: `listen: ':${cfg.port}'` |
| `panel/server/index.js:233-340` | WebSocket-хендлеры: `cfg.port \|\| 443` в ссылках, `PORT: String(cfg.port \|\| 443)` в env |
| `panel/server/controllers/naiveController.js:75` | Ссылка пользователя: `${cfg.domain}:${cfg.port}` |
| `panel/server/controllers/hysteriaController.js:171` | Ссылка пользователя: `${cfg.domain}:${cfg.port}` |
| `panel/server/controllers/systemController.js:42` | `/api/status` возвращает `port: cfg.port` |
| `panel/server/controllers/diagController.js:38-40` | `getPorts()` передаёт `cfg.port` в `checkPorts()` |
| `panel/server/trafficMonitor.js:48,67-70,82,85-96` | `ensureRules(port)`, `removeRules(port)` — параметризованы |
| `panel/server/services/systemAdapter.js:132-137` | `checkPorts(port)` — динамический grep |
| `panel/server/caddyfile.js:15` | Парсер `extractCustomBlocks`: regex `^:\d+,\s*([^\s{]+)` вместо `:443` |

### Фронтенд (React)

| Файл | Что изменено |
|------|-------------|
| `panel/src/types/api.ts:51,64` | `SystemStatus` и `Config` содержат `port: number` |
| `panel/src/pages/Dashboard/index.tsx:85,116` | `TCP/{status.port}`, `UDP/{status.port}` |
| `panel/src/pages/Users/index.tsx:23,41,106-108` | Стейт `port` загружается из API, `makeLink()` использует динамический порт |
| `panel/src/pages/Settings/index.tsx:127-128` | Плейсхолдер `PORT` вместо `443` |
| `panel/src/pages/Install/index.tsx:43` | Убран `port 443` из описания опции |

### Фронтенд (Legacy JS)

| Файл | Что изменено |
|------|-------------|
| `panel/public/js/app.js:301,321,597,598` | Ссылки: `${status.port \|\| 443}` |
| `panel/public/js/app.js:377,382,387` | Информационные подписи без жёсткого порта |

### Инсталл-скрипты панели

| Файл | Что изменено |
|------|-------------|
| `panel/scripts/install_naiveproxy.sh:17,79-80,206,302` | `PORT="${PORT:-443}"`, UFW: `${PORT}`, Caddyfile: `:${PORT}`, сводка: `:${PORT}` |
| `panel/scripts/install_hysteria.sh:15,67-68,122,391` | `PORT="${PORT:-443}"`, UFW: `${PORT}`, конфиг: `listen: :${PORT}`, сводка: `:${PORT}` |

### Тесты

| Файл | Что изменено |
|------|-------------|
| `panel/server/__tests__/configBuilder.test.js:15,30` | `makeCfg()`, `makeHyCfg()` — `port: 443` |
| `panel/src/pages/Dashboard/index.test.tsx:22` | Мок `getStatus` — `port: 443` |
| `panel/src/pages/Users/index.test.tsx:23` | Мок `getConfig` — `port: 443` |

---

## Поток данных

```
config.json → storage.js / sqliteStorage.js → loadConfig()
  ↓
controller: cfg.port → /api/status → { port: cfg.port }
  ↓
frontend: SystemStatus.port → UI labels + link generation
  ↓
controller: cfg.port → configBuilder → Caddyfile + Hysteria2 config → диск
  ↓
index.js:     cfg.port → trafficMonitor.ensureRules(port) → iptables
  ↓
index.js:     cfg.port → install scripts (PORT env) → Caddyfile / Hy2 config
```

---

## Защита от undefined

Везде где порт передаётся между компонентами добавлен fallback `|| 443`:
- `index.js`: `cfg.port || 443` в WebSocket-хендлерах
- `trafficMonitor.js`: `String(port || 443)`
- `app.js`: `status.port || 443`
- Инсталл-скрипты: `PORT="${PORT:-443}"`

---

## Результат проверки

- ESLint: ✓
- TypeScript (`tsc --noEmit`): ✓
- Vitest: 148/148 тестов ✓
- Vite build: ✓
