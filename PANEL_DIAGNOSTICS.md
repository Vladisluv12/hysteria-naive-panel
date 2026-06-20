# Diagnostics: Frontend Panel — Naive + Hysteria2

> Дата диагностики: 2026-06-19 (обновлено)
> Версия панели: latest (.panel.json)

---

## Структура проекта

Два фронтенда сосуществуют в одном проекте:

| Фронтенд | Путь | Технология | Выбор через |
|-----------|------|------------|-------------|
| Legacy | `panel/public/` | Vanilla JS + HTML + глобальный CSS | `USE_NEW_FRONTEND` не `true` |
| React (новый) | `panel/src/` | React + TypeScript + CSS Modules | `USE_NEW_FRONTEND=true` |

Бэкенд: Express (`panel/server/`), сессии через `express-session`, куки `rixxx_sid`.

---

## Страницы React-фронтенда

| Маршрут | Страница | Описание |
|---------|----------|----------|
| `/login` | Login | Форма входа |
| `/` | Dashboard | Статус сервисов + трафик |
| `/install` | Install | WebSocket-установщик прокси |
| `/users` | Users | CRUD пользователей (Naive + Hysteria2 вкладки) |
| `/tuning` | Tuning | BBR + UDP буферы |
| `/bypass` | Bypass | Bypass CIDRs для Hysteria2 |
| `/acl` | ACL | Access Control List (домены, geosite, geoip) |
| `/diagnostics` | Diagnostics | Логи, порты, конфиг Hysteria2 |
| `/settings` | Settings | Смена пароля, информация, клиенты |

---

## Обнаруженные проблемы

### BUG-01: Users API — несовпадение типов ответа

**Severity: CRITICAL — ИСПРАВЛЕНО**

Бэкенд оборачивает ответ в `{ users: [...] }`, фронтенд теперь ожидает тот же формат:

- `api/naive.ts:4` → `Promise<NaiveUserListResponse>` (`{ users: NaiveUser[] }`)
- `api/hysteria.ts:4` → `Promise<HysteriaUserListResponse>` (`{ users: HysteriaUser[] }`)
- `types/api.ts:19-25` — типы `NaiveUserListResponse` и `HysteriaUserListResponse` определены
- `pages/Users/index.tsx:36` — корректно потребляет `u.users`
- Имена полей совпадают: `createdAt`, `expiresAt` в обоих слоях

---

### BUG-02: Dashboard — несовпадение статуса сервисов

**Severity: CRITICAL — ИСПРАВЛЕНО**

Типы приведены к реальным ответам бэкенда:

- `types/api.ts:44-53` — `SystemStatus { naive: {active, usersCount}, hy2: {active, usersCount} }`
- `pages/Dashboard/index.tsx:56-57` — обращается к `status.naive?.active`, `status.hy2?.active`
- `server/controllers/systemController.js:35-44` — отдаёт `{ naive: {active, usersCount}, hy2: {active, usersCount} }`

---

### BUG-03: Diagnostics — несовпадение типов логов/портов

**Severity: HIGH — ИСПРАВЛЕНО**

Типы приведены к реальным ответам:

- `types/api.ts:105-117` — `LogsResponse { unit, output }`, `PortsResponse { output }`, `HysteriaConfigResponse { exists, output }`
- `pages/Diagnostics/index.tsx:22,25,28` — потребляет `res.output`
- Все три endpoint'а совпадают с фронтенд-типами

---

### BUG-04: Bypass — несовпадение типов

**Severity: HIGH — ИСПРАВЛЕНО**

Типы приведены к реальным ответам:

- `types/api.ts:119-125` — `BypassStatus { enabled, count, source, updatedAt, preview }`
- `pages/Bypass/index.tsx:83-99` — обращается к `status?.count`, `status?.source`, `status?.updatedAt`
- `server/controllers/hysteriaController.js:96-100` — отдаёт `{ enabled, count, source, updatedAt, preview }`

---

### BUG-05: ACL page — сломанные стили

**Severity: HIGH — ИСПРАВЛЕНО**

Глобальные CSS-классы добавлены в `panel/src/styles/global.css` (строки 65-180):

**Добавлены классы:** `.page-header`, `.page-title`, `.btn`, `.btn-outline`, `.btn-sm`, `.btn-shiny`, `.card`, `.card-header`, `.card-title`, `.card-body`, `.cards-row`, `.form-group`, `.form-input`, `.form-actions`, `.info-row`, `.info-key`, `.info-val`, `.mono`, `.dot`, `.dot-green`, `.dot-gray`, `.tuning-desc`.

Все классы, используемые страницей ACL, теперь определены в глобальном CSS React-приложения.

---

### BUG-06: ACL отсутствует в sidebar-навигации

**Severity: MEDIUM — ИСПРАВЛЕНО**

- `panel/src/components/Layout/index.tsx:11` — `{ to: '/acl', label: 'ACL' }` присутствует в `navItems`

---

### BUG-07: mustChangePassword игнорируется фронтендом

**Severity: HIGH — ИСПРАВЛЕНО**

- `AuthContext.tsx:43-46` — `login()` возвращает `{ mustChangePassword }` из ответа бэкенда
- `AuthContext.tsx:59` — `const mustChangePassword = !!user?.mustChangePassword;`
- `AuthContext.tsx:62` — предоставляется через provider
- `Login/index.tsx:19-23` — после логина проверяет `result.mustChangePassword` и редиректит на `/settings` при дефолтном пароле
- `Dashboard/index.tsx:63-76` — отображает предупреждение со ссылкой на Settings

---

### BUG-08: Дублирование Traffic API с разными типами

**Severity: MEDIUM — ИСПРАВЛЕНО**

Файл `panel/src/api/traffic.ts` **удалён**. Трафик доступен только через `panel/src/api/system.ts` → `getTraffic()`.

---

### BUG-09: WebSocket auth — фейковая проверка

**Severity: CRITICAL (Security) — ИСПРАВЛЕНО**

`server/index.js:125-144` — WebSocket handler теперь запускает `sessionMiddleware` и проверяет `req.session?.authenticated`. Корректная проверка сессии вместо substring match.

---

## Сводная таблица

| # | Баг | Статус | Severity |
|---|-----|--------|----------|
| 01 | Users API — типы ответа и имена полей | **FIXED** | CRITICAL |
| 02 | Dashboard — статус сервисов | **FIXED** | CRITICAL |
| 03 | Diagnostics — логи/порты/конфиг | **FIXED** | HIGH |
| 04 | Bypass — типы | **FIXED** | HIGH |
| 05 | ACL page — сломанные стили | **FIXED** | HIGH |
| 06 | ACL — нет в sidebar | **FIXED** | MEDIUM |
| 07 | mustChangePassword игнорируется | **FIXED** | HIGH |
| 08 | Traffic API дублирование | **FIXED** | MEDIUM |
| 09 | WebSocket auth — substring check | **FIXED** | CRITICAL |

---

### BUG-10: Install page — hardcoded цвета вместо CSS-переменных

**Severity: MEDIUM — ИСПРАВЛЕНО**

Все hardcoded hex-цвета заменены на `var(--*)` токены:

| Было (hardcoded) | Стало (CSS var) |
|-------------------|-----------------|
| `background: #16213e` | `var(--bg-card)` |
| `background: #2a2a4a` | `var(--bg-surface)` |
| `color: #7c4dff` | `var(--accent-bright)` |
| `color: #c9d1d9` | `var(--text-primary)` |
| `color: #888` | `var(--text-muted)` |
| `color: #ef5350` | `var(--danger)` |
| `color: #66bb6a` | `var(--success)` |
| `background: #0d1117` | `var(--bg-surface)` |
| `#fff` (кнопки) | `var(--text-primary)` + shiny gradient как у `.btn-shiny` |
| `border: 2px solid #2a2a4a` | `2px solid var(--bg-surface)` + `var(--border)` на секциях |
| `font-family: monospace` | `var(--font-mono)` |

Дизайн теперь консистентен с остальными страницами.

---

### BUG-11: Diagnostics — "bad kind" при переключении вкладок

**Severity: HIGH — ИСПРАВЛЕНО**

Фронтенд шлёт `caddy`/`hysteria`, бэкенд ждал `naive`/`hy2`. Добавлены алиасы:

```js
// server/controllers/diagController.js:25
const unitMap = { naive: 'caddy', caddy: 'caddy', hy2: 'hysteria-server', hysteria: 'hysteria-server', panel: 'pm2-root' };
```

### BUG-12: Users — двойная кнопка при overflow

**Severity: MEDIUM — ИСПРАВЛЕНО**

При переполнении таблицы оба toolbar (верхний и нижний) рендерились одновременно, создавая дублирование кнопки "Добавить пользователя".

**Фикс:** bottom toolbar скрывается через `display: none` когда `overflows = true` (`Users/index.tsx:128`).

---

### BUG-13: Users — нет listener на resize окна

**Severity: LOW — ИСПРАВЛЕНО**

ResizeObserver следил только за контейнером `.page`, но не реагировал на resize окна. Если таблица влезала при большом окне, но не влезала при маленьком — это не детектилось.

**Фикс:** добавлен `window.addEventListener('resize', check)` + cleanup (`Users/index.tsx:65-69`).

---

## Сводная таблица

| # | Баг | Статус | Severity |
|---|-----|--------|----------|
| 01 | Users API — типы ответа и имена полей | **FIXED** | CRITICAL |
| 02 | Dashboard — статус сервисов | **FIXED** | CRITICAL |
| 03 | Diagnostics — логи/порты/конфиг | **FIXED** | HIGH |
| 04 | Bypass — типы | **FIXED** | HIGH |
| 05 | ACL page — сломанные стили | **FIXED** | HIGH |
| 06 | ACL — нет в sidebar | **FIXED** | MEDIUM |
| 07 | mustChangePassword игнорируется | **FIXED** | HIGH |
| 08 | Traffic API дублирование | **FIXED** | MEDIUM |
| 09 | WebSocket auth — substring check | **FIXED** | CRITICAL |
| 10 | Install — hardcoded цвета | **FIXED** | MEDIUM |
| 11 | Diagnostics — "bad kind" | **FIXED** | HIGH |
| 12 | Users — двойная кнопка | **FIXED** | MEDIUM |
| 13 | Users — нет resize listener | **FIXED** | LOW |

---

## Итого

**Все 13 багов исправлены.** React-фронтенд полностью рабочий, дизайн консистентен.
