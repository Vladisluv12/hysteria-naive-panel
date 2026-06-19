# ACL Site Blocking — Design Spec

**Date:** 2026-06-16
**Status:** draft

## Overview

Добавить в панель полноценное управление ACL-правилами Hysteria2:
блокировка сайтов по доменам, гео-категориям (geosite) и странам (geoip),
поверх существующего bypass (direct CIDR).

## Current State

Сейчас панель управляет только bypass — список CIDR, для которых трафик идёт
напрямую через `direct(cidr)`. Генерируемый файл: `/etc/hysteria/bypass-ru.acl`.
Блокировка сайтов (`reject(...)`) не поддерживается. geoip/geosite не используются.

## Target State

Единая страница ACL в панели, позволяющая:
- **Блокировать домены** — список суффиксов (vk.com, instagram.com) → `reject(suffix:...)`
- **Блокировать geosite-категории** — чекбоксы (netflix, youtube, twitter, etc.)
- **Блокировать geoip-страны** — чекбоксы (cn, ru, ir, etc.)
- **Просматривать bypass CIDR** — read-only (редактируются на странице Bypass)
- **Обновлять geoip/geosite датасеты** — авто (через Hysteria `geoUpdateInterval`) + ручная кнопка

ACL-файл генерируется в `/etc/hysteria/acl.rules`. Конфиг Hysteria дополняется
секциями `acl.file`, `acl.geoip`, `acl.geosite`, `acl.geoUpdateInterval`.

## Data Model

### `panel/data/acl.json`

```json
{
  "enabled": true,
  "blockDomains": ["vk.com", "instagram.com"],
  "blockGeosite": ["netflix", "youtube"],
  "blockGeoip": ["cn", "ru"],
  "bypassCidrs": ["10.0.0.0/8", "192.168.0.0/16"],
  "directAll": true,
  "updatedAt": "2026-06-16T12:00:00Z"
}
```

- `enabled` — включает/выключает ACL целиком
- `blockDomains` — массив доменов (без http://, без портов)
- `blockGeosite` — массив названий категорий v2ray geosite
- `blockGeoip` — массив двухбуквенных кодов стран
- `bypassCidrs` — зеркалируется из `bypass.json` при генерации ACL
- `directAll` — добавлять `direct(all)` в конце (почти всегда true)

### Generated ACL file (`/etc/hysteria/acl.rules`)

```
reject(suffix:vk.com)
reject(suffix:instagram.com)
reject(geosite:netflix)
reject(geosite:youtube)
reject(geoip:cn)
reject(geoip:ru)
direct(10.0.0.0/8)
direct(192.168.0.0/16)
direct(all)
```

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/acl` | required | Текущие правила |
| PUT | `/api/acl` | required | Сохранить правила (body: ACL JSON) |
| POST | `/api/acl/geo-update` | required | Скачать geoip.dat/geosite.dat вручную |
| GET | `/api/acl/geosite-list` | required | Список доступных geosite категорий |
| GET | `/api/acl/geoip-list` | required | Список доступных geoip кодов стран |

### PUT `/api/acl` body

```json
{
  "enabled": true,
  "blockDomains": ["vk.com"],
  "blockGeosite": ["netflix"],
  "blockGeoip": ["cn"],
  "directAll": true
}
```

Валидация:
- `blockDomains` — каждый элемент: непустая строка, без `://`, без `/`, макс 253 символа
- `blockGeosite` — каждый элемент должен быть в списке допустимых категорий
- `blockGeoip` — каждый элемент: ровно 2 буквы a-z, lowercase

## Backend Implementation

### Новые файлы

| File | Purpose |
|------|---------|
| `panel/server/routes/acl.js` | ACL routes |
| `panel/server/controllers/aclController.js` | ACL controller |
| `panel/server/services/aclBuilder.js` | Генерация ACL-файла из правил |

### Изменяемые файлы

| File | Change |
|------|--------|
| `panel/server/index.js` | Подключить `routes/acl.js` |
| `panel/server/controllers/hysteriaController.js` | Вызывать `writeAclFile()` вместо/вместе с `applyBypassAcl()` |
| `panel/server/services/configBuilder.js` | Добавить секции acl.geoip, acl.geosite, acl.geoUpdateInterval |
| `panel/server/services/atomicConfig.js` | Поддержка записи ACL-файла (атомарно) |

### Flow при сохранении ACL

1. PUT `/api/acl` → валидация → сохранение в `acl.json`
2. `aclBuilder.generateAclFile()` — читает `acl.json` + `bypass.json`, пишет `/etc/hysteria/acl.rules`
3. `configBuilder.buildHysteriaConfigObject()` — добавляет `acl.file`, `geoip`, `geosite`, `geoUpdateInterval`
4. `atomicConfig.writeHysteriaConfig()` — атомарная запись `config.yaml`
5. `systemctl restart hysteria-server`

### Geoip/Geosite датасеты

Скачиваются из v2fly/geoip репозитория GitHub releases:
- `https://github.com/v2fly/geoip/releases/latest/download/geoip.dat`
- `https://github.com/v2fly/geoip/releases/latest/download/geosite.dat`

Сохраняются в `/etc/hysteria/geoip.dat` и `/etc/hysteria/geosite.dat`.

Hysteria обновляет их автоматически каждые `geoUpdateInterval` (168h = 7 дней).
Ручная кнопка делает `POST /api/acl/geo-update` → качает оба файла → рестарт hysteria-server.

### Списки категорий (статические, вшиты в код)

**geositeCategories:**
`netflix`, `youtube`, `twitter`, `facebook`, `instagram`, `tiktok`, `spotify`,
`discord`, `telegram`, `whatsapp`, `amazon`, `microsoft`, `apple`, `google`,
`cloudflare`, `openai`, `category-games`

**geoipCountries:**
`cn`, `ru`, `ir`, `kp`, `cu`, `sy`, `by`, `af`, `ve`, `mm`

## Frontend

### Новая страница: ACL

Путь в React роутере: `/acl`
Пункт в боковом меню: «ACL / Блокировка» (после Bypass)

Компоненты:
- `Switch` — включить/выключить ACL
- Секция «Блокировка доменов»: textarea (по домену на строку)
- Секция «Geosite категории»: grid чекбоксов
- Секция «Geoip страны»: grid чекбоксов
- Секция «Bypass CIDR»: read-only список, ссылка «редактировать на странице Bypass»
- Кнопка «Обновить geoip/geosite датасеты»
- Кнопка «Сохранить»

### Новые файлы

| File | Purpose |
|------|---------|
| `panel/src/pages/ACL/index.tsx` | Страница ACL |
| `panel/src/api/acl.ts` | API-клиент для ACL |

### Изменяемые файлы

| File | Change |
|------|--------|
| `panel/src/App.tsx` | Добавить роут `/acl` |
| `panel/src/components/Layout/index.tsx` | Добавить пункт меню |
| `panel/src/types/api.ts` | Добавить типы ACL |

### Legacy frontend (public/)

Не трогаем — новые фичи только в React-версии.

## Тестирование

### Unit (Vitest)

- `aclBuilder.generateAclFile()` — проверка содержимого сгенерированного файла
- ACL controller валидация — reject невалидных доменов, геокатегорий, стран

### Integration (Python/pytest)

- Проверка `/api/acl` CRUD
- Проверка генерации `/etc/hysteria/acl.rules`
- Проверка встраивания ACL в конфиг Hysteria
- Проверка скачивания geoip/geosite датасетов

## Обратная совместимость

- Существующий `bypass.json` и `/etc/hysteria/bypass-ru.acl` продолжают работать
- При первом включении ACL через новую страницу старый bypass-файл перестаёт использоваться
- Если ACL отключён — поведение как раньше (bypass-ru.acl, если bypass включён)
