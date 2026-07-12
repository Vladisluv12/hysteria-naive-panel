# Async CRUD и кэширование — как это работает

## 1. Архитектура (общая схема)

```
Frontend (React)        Backend API (Express)          syncService (каждые 3с)        Systemd
     │                        │                             │                          │
     ├─ POST /createUser ─────►│                             │                          │
     │                        ├─ updateConfig()              │                          │
     │                        │  (сохраняет в panel.db +     │                          │
     │                        │   config.json)               │                          │
     │                        ├─ res.json(link) ────────────►│                          │
     │  ← { link } ───────────┤                             │                          │
     │                        ├─ enqueue(protocol)           │                          │
     │                        │                             │                          │
     │  loadUsers() ──────────►        ... 0-3s ...         │                          │
     │                        │                             ├─ drain()                  │
     │                        ├─ listUsers()                 │  (SELECT DISTINCT)       │
     │  ← users[] ────────────┤                             ├─ writeConfig()            │
     │                        │                             │  (AtomicFileTransaction)  │
     │                        │                             ├─ restartService() ───────►│
     │                        │                             │                          │
```

## 2. Кэширование — где оно есть и где его нет

### Нет кэша (все основные данные)

| Данные                | Источник          | Кэш |
|-----------------------|-------------------|-----|
| Список пользователей  | panel.db SQLite   | Нет — читается с диска на каждый запрос |
| Конфигурация панели   | panel.db / JSON   | Нет — `loadConfig()` каждый раз читает с диска |
| Трафик пользователей  | Xray API / iptables | Нет — запрос к `127.0.0.1:10085` каждый раз |
| Состояние сервисов    | systemctl         | Нет — вызов systemctl каждый раз |

### Есть кэш (минимально)

- **Mieru `_tpCache`**: при `getTrafficPattern()` результат `mita export traffic-pattern` кэшируется в памяти модуля. Сбрасывается при каждом изменении пользователей mieru. Это единственное место с осознанным кэшем.

### Почему это проблема

Каждый раз, когда фронтенд вызывает `listUsers()`:
1. Express роут получает запрос
2. `loadConfig()` читает panel.db (SQLite) или config.json (диск I/O)
3. Для каждого пользователя вызывается `enrichUser()` → `remainingSeconds()` → чистая математика
4. Параллельно фронтенд вызывает `systemApi.getConfig()` (ещё одно чтение с диска)
5. И `trafficMonitor` — запрос к xray API (127.0.0.1:10085) или чтение /proc/net/dev

**Основная задержка — не CPU, а дисковый I/O при SQLite/JSON и ожидание xray API.**

## 3. Async CRUD — полный цикл

### 3.1 createUser (одинаково для naive, hy2, mieru, vless)

```
1. POST /api/vless/users  body: { username, password, expireDays }
2. Валидация (username, password, expireDays)
3. updateConfig():
   a. loadConfig() — читает panel.db / config.json
   b. Мутирует: c.vlessUsers.push({ username, password, uuid, ... })
   c. saveConfig() — пишет в panel.db И config.json (dual-write)
4. Формирует vless:// ссылку
5. res.json({ success: true, link: "vless://..." }) — ответ фронтенду
6. enqueue('vless', 'create', username)  — вставка в queue.db
7. Выход из контроллера

--- через 0-3 секунды (syncService tick) ---

8. drain() — SELECT DISTINCT protocol FROM pending_changes, DELETE FROM pending_changes
9. loadConfig() — повторное чтение panel.db / config.json
10. buildVlessConfigObject(cfg) — сборка полного xray конфига
11. writeVlessConfig() — AtomicFileTransaction:
    - backup → config.json.last
    - write → config.json.new
    - validate → xray run -test (проверка)
    - commit → rename config.json.new → config.json
12. restartVless() — systemctl restart xray
```

### 3.2 deleteUser

Аналогично create, но:
- `updateConfig()` удаляет пользователя из массива
- Нет формирования ссылки
- `res.json({ success: true })` сразу
- enqueue тот же

### 3.3 Почему 3 секунды?

В `index.js:544`:
```js
syncService.startSync(3000);  // каждые 3000мс
```

Это не debounce, а простой `setInterval`. Если за 3 секунды пришло 10 изменений vless — всё схлопнется в один drain, один writeConfig, один restart.

### 3.4 Проблема: enqueue теряет тип операции

```js
// syncService.js
function drain() {
  return db.transaction(() => {
    const rows = db.prepare('SELECT DISTINCT protocol FROM pending_changes').all();
    db.prepare('DELETE FROM pending_changes').run();
    return rows.map(r => r.protocol);  // только protocol, НЕ operation!
  })();
}
```

`operation` (create/delete/update) и `user_id` пишутся в queue.db, но никогда не читаются. `syncAll()` делает одно и то же для любого operation: переписывает весь конфиг и перезапускает сервис. Получается, что `operation` — мёртвое поле.

## 4. Почему таблица на фронтенде грузится «какое-то время»

### Последовательность после create/delete:

```
1. Фронт: POST /createUser → ждёт ответ (быстро, ~50-200мс)
2. Фронт: ← { success: true, link: "..." }
3. Фронт: loadUsers()
   ┌─ api.listUsers()          → читает panel.db (быстро, ~10-50мс)
   ├─ systemApi.getConfig()    → читает panel.db (быстро, ~10-50мс)
   └─ api.getTraffic()         → xray api statsquery (МЕДЛЕННО, ~500-5000мс)
4. Фронт: ← данные
5. Фронт: setUsers(u.users)
6. Фронт: setLoading(false)
```

**Основная причина**: `loadUsers()` ждёт ВСЕ три запроса, включая трафик. Если xray в этот момент перезапускается (syncService запустил restart), то `statsquery` падает с `EOF`, и фронт ждёт таймаута.

### Проблема: frontend ждёт трафик для показа таблицы

```tsx
// src/pages/Users/index.tsx
const loadUsers = useCallback(async () => {
  setLoading(true);
  const [u, config] = await Promise.all([
    api.listUsers(),
    systemApi.getConfig(),
  ]);
  setUsers(u.users);
  // Traffic fetch — может тормозить, но блокирует setLoading
  if (proxyType !== 'mieru') {
    const trafficRes = await api.getUserTraffic();
    // ...
  }
  setLoading(false);
}, [proxyType, addToast]);
```

Трафик запрашивается ПОСЛЕ установки пользователей, НО `setLoading(false)` вызывается только после получения трафика. Если `getUserTraffic()` медленный — вся таблица висит в спиннере.

## 5. Рекомендации

1. **Разделить загрузку**: таблицу пользователей показывать сразу, трафик подгружать асинхронно:
   ```tsx
   setUsers(u.users);
   setLoading(false);  // показать таблицу
   fetchTraffic();      // трафик — потом
   ```

2. **Добавить кэш на уровне API**: мемоизировать `loadConfig()` в памяти с TTL 1-3 секунды

3. **syncService не должен перезапускать xray при каждом изменении** (но это сложнее и требует hot-reload поддержки от xray)

4. **`operation` и `user_id` в queue.db — мёртвый груз**: можно убрать, если не планируется per-user инвалидация
