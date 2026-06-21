# Plan: ACL для NaiveProxy через caddy_addon

## Контекст

caddy_addon (fork forwardproxy) теперь поддерживает полный ACL в Caddyfile:
`geoip:`, `geosite:`, `bypass_private`, `private deny/allow`, протокол/порт фильтры.
ACL.json уже существует и управляет ACL для Hysteria2. Нужно расширить его на NaiveProxy.

## Текущее состояние

- `acl.json` — единый конфиг ACL (blockDomains, blockGeosite, blockGeoip, blockPrivateIPs, directCidrs, directAll)
- `aclBuilder.js` — генерирует ACL-файл для Hysteria2 (`reject()` / `direct()`)
- `configBuilder.js` — генерирует Caddyfile, но ACL-блок **не включает**
- `aclController.js` — API, после сохранения перезапускает только Hysteria2

## Изменения

### 1. `aclBuilder.js` — добавить `generateNaiveAcl(acl)`

Новая функция, возвращает Caddyfile ACL-блок (строку).

Маппинг из acl.json:

| acl.json | Caddyfile |
|----------|-----------|
| `blockPrivateIPs: true` (default) | *ничего* (по умолчанию заблокированы) |
| `blockPrivateIPs: false` | `bypass_private` |
| `blockDomains: ["vk.com"]` | `deny *.vk.com` |
| `blockGeosite: ["category-ru"]` | `geosite:category-ru deny` |
| `blockGeoip: ["ru"]` | `geoip:RU deny` |
| `directCidrs: ["10.0.0.0/8"]` | `allow 10.0.0.0/8` |
| `directAll: true` | `allow all` |

Порядок правил (сверху вниз):
1. `bypass_private` (если blockPrivateIPs=false)
2. deny домены (с поддоменами: `*.domain`)
3. geosite deny
4. geoip deny
5. allow CIDRs
6. `allow all` (если directAll=true)

### 2. `configBuilder.js` — принять ACL, вставить в Caddyfile

`buildCaddyContent(cfg, customBlocks, acl)` — если acl передан:
- Добавить `geoip_dat` / `geosite_dat` директивы в `forward_proxy`
- Вставить `acl { ... }` блок (результат `generateNaiveAcl()`)

### 3. `naiveController.js` — передавать ACL при записи Caddyfile

`writeCaddyfile(cfg)` → `writeCaddyfile(cfg, acl)` — загружает ACL через `loadAcl()` и передаёт в `buildCaddyContent()`.

### 4. `aclController.js` — перезапуск Caddy после save

В `updateAcl()` и `geoUpdate()`: если naive включён — пересобрать Caddyfile и перезапустить Caddy.

### 5. Frontend — табы превью на ACL-page

Добавить табы "Hysteria2" / "NaiveProxy" в секции предпросмотра ACL-файла.
Оба превью генерируются на клиенте (дублируя логику бэкенда).

### 6. Тесты

- `aclBuilder.test.js` — тесты `generateNaiveAcl()`
- Проверка что Caddyfile содержит ACL-блок

## Файлы

- `panel/server/services/aclBuilder.js`
- `panel/server/services/configBuilder.js`
- `panel/server/controllers/naiveController.js`
- `panel/server/controllers/aclController.js`
- `panel/src/pages/ACL/index.tsx`
- `panel/src/types/api.ts` (если нужно)
- `panel/server/__tests__/aclBuilder.test.js`
