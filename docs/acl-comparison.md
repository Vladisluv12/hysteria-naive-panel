# Сравнение ACL: Hysteria2 vs NaiveProxy

## Архитектурные различия

| Параметр | Hysteria2 | NaiveProxy (caddy_addon) |
|----------|-----------|--------------------------|
| Где хранится конфиг | Внешний файл `/etc/hysteria/acl.rules` | Инлайн в Caddyfile (`forward_proxy { acl { ... } }`) |
| Формат правил | `reject(direct,default)(address, proto/port, hijack)` | `allow/deny <subjects>`, `allow_file`, `deny_file` |
| Geo-поддержка | Да (`geoip:`, `geosite:` через geoip.dat/geosite.dat) | Нет (только IP/домены) |
| Фильтр по proto/port | Да (`tcp/80`, `udp/53`, `*/443`) | Нет (порты через отдельный `AllowedPorts`) |
| Hijack | Да (3-й аргумент — перенаправить на другой IP) | Нет |
| Приватные IP | **Не блокируются автоматически** | Захардкожены в `forwardproxy.go:161` |
| Порядок правил | Первое совпадение побеждает, сверху вниз | То же — первое совпадение побеждает |
| Catch-all | Определяется последним правилом (обычно `direct(all)`) | Всегда `allow` (hardcoded в конце) |
| Outbounds | Кастомные (type: direct/socks5/http, name: ...) | Нет — только allow/deny |

## Список приватных IP (захардкожен в NaiveProxy, отсутствует в Hysteria2)

```
10.0.0.0/8
127.0.0.0/8
172.16.0.0/12
192.168.0.0/16
::1/128
fe80::/10
```

## Типы правил

### Hysteria2

```
reject(geoip:cn)                  # блок по стране
reject(geosite:facebook)          # блок по категории сайтов
reject(suffix:example.com)        # блок по домену (и все поддомены)
reject(1.2.3.0/24)               # блок по CIDR
reject(all, udp/443)              # блок QUIC-трафика
reject(all, tcp/25)               # блок SMTP
direct(10.0.0.0/8)               # прямое подключение
default(8.8.8.8, *, 1.1.1.1)    # hijack: перенаправить на другой IP
```

### NaiveProxy

```
allow 0.0.0.0/0          # разрешить всё
deny 192.168.0.0/16      # запретить подсеть
allow *.example.com       # разрешить домен с поддоменами
deny all                  # запретить всё остальное
allow_file /path/to/list # разрешить из файла
deny_file /path/to/list  # запретить из файла
```

## Реализация ACL в панели

### Hysteria2

- **Бэкенд**: `panel/server/services/aclBuilder.js` → генерирует `/etc/hysteria/acl.rules`
- **API**: `GET/PUT /api/acl`, `POST /api/acl/geo-update`
- **Фронтенд**: страница ACL в панели (`panel/src/pages/ACL/index.tsx`)
- **Параметры**: `enabled`, `blockDomains`, `blockGeosite`, `blockGeoip`, `directAll`
- **Geo-датасеты**: скачиваются из v2fly, хранятся в `/etc/hysteria/`
- **Bypass**: отдельный механизм `bypass.json` → `direct(<cidr>)` правила в ACL

### NaiveProxy

- **Бэкенд**: Caddyfile генерируется панелью, ACL задаётся инлайн
- **API**: нет отдельных эндпоинтов для ACL
- **Фронтенд**: нет UI для ACL
- **Параметры**: `basic_auth`, `hide_ip`, `hide_via`, `probe_resistance`, `traffic_file`, `acl { allow/deny ... }`

---

## План доработки

### Убрать вкладку Bypass, интегрировать в ACL

**Вкладка Bypass удаляется полностью.** Вся функциональность переносится в ACL.

- Удалить `panel/server/controllers/hysteriaController.js` — функции `getBypass`, `updateBypass`, `clearBypass`, `applyBypassAcl`, `loadBypass`, `saveBypass`
- Удалить `panel/server/routes/acl.js` — эндпоинты bypass (если есть отдельные роуты)
- Удалить `data/bypass.json` — больше не используется
- Удалить `HY2_ACL_PATH = /etc/hysteria/bypass-ru.acl` — файл больше не нужен
- Hysteria2 всегда ссылается на `/etc/hysteria/acl.rules`

### Добавить секцию «Прямое подключение (CIDR)» в ACL

В существующую страницу ACL добавить новую секцию:

- Поле ввода CIDR (textarea, по одному на строку)
- **По умолчанию** — захардкоженные приватные диапазоны:
  ```
  10.0.0.0/8
  127.0.0.0/8
  172.16.0.0/12
  192.168.0.0/16
  ::1/128
  fe80::/10
  ```
- Эти CIDR генерируют `direct(<cidr>)` правила в ACL-файле
- Валидация формата CIDR при сохранении
- Возможность добавить свои CIDR (например, российские подсети)

### Добавить блок приватных IP по умолчанию

- Отдельный чекбокс «Блокировать приватные IP» (по умолчанию **включен**)
- При включении генерирует:
  ```
  reject(10.0.0.0/8)
  reject(127.0.0.0/8)
  reject(172.16.0.0/12)
  reject(192.168.0.0/16)
  reject(::1/128)
  reject(fe80::/10)
  ```
- При выключении — эти правила убираются из ACL

### Добавить предпросмотр ACL-файла

- Показать итоговый ACL-файл (read-only textarea или code block)
- Обновляться при любом изменении настроек ACL
- Позволяет убедиться, что порядок и содержание правильные

### Порядок правил в ACL-файле

Итоговый файл генерируется в таком порядке:
1. `reject(...)` — приватные IP (если чекбокс включен)
2. `reject(suffix:<domain>)` — заблокированные домены
3. `reject(geosite:<category>)` — заблокированные geosite-категории
4. `reject(geoip:<country>)` — заблокированные geoip-страны
5. `direct(<cidr>)` — прямое подключение (из секции CIDR)
6. `direct(all)` — catch-all (если `directAll` включен)

### Файлы для изменения

| Файл | Действие |
|------|----------|
| `panel/server/services/aclBuilder.js` | Добавить `blockPrivateIPs`, `directCidrs` в модель; обновить `generateAclContent`; удалить зависимости от bypass |
| `panel/server/controllers/aclController.js` | Обновить `updateAcl` — принимать новые параметры; удалить bypass-эндпоинты |
| `panel/server/controllers/hysteriaController.js` | Удалить `applyBypassAcl`, `getBypass`, `updateBypass`, `clearBypass`, `loadBypass`, `saveBypass` |
| `panel/server/routes/acl.js` | Удалить bypass-роуты |
| `panel/src/types/api.ts` | Добавить `blockPrivateIPs: boolean`, `directCidrs: string[]` в `AclConfig` и `AclUpdateInput` |
| `panel/src/pages/ACL/index.tsx` | Добавить UI: чекбокс приватных IP, textarea CIDR, preview ACL-файла |
| `panel/src/api/acl.ts` | Без изменений (API тот же) |
| Тесты `aclBuilder.test.js` | Обновить тесты для новых параметров |
