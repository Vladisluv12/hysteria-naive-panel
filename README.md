# Panel Naive + Hysteria2 by RIXXX

> Веб-панель для управления **NaiveProxy** и **Hysteria2** на VPS

---

## Быстрая установка

### Основной скрипт (рекомендуется)

```bash
sudo bash vps_test_install.sh
```

Интерактивно задаст все параметры и установит всё необходимое.

### Автоматический режим (без вопросов)

```bash
sudo DOMAIN="vpn.example.com" NAIVE_USER="u1" NAIVE_PASS="p1" HY2_PASS="p2" bash vps_test_install.sh
```

### Доступные переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `DOMAIN` | — | Домен (обязательно) |
| `NAIVE_USER` | рандомный | Логин NaiveProxy |
| `NAIVE_PASS` | рандомный | Пароль NaiveProxy |
| `HY2_PASS` | рандомный | Пароль Hysteria2 |
| `TLS_MODE` | `selfsigned` | `selfsigned` или `letsencrypt` |
| `EMAIL` | — | Email для Let's Encrypt |
| `PROXY_PORT` | `8443` | Порт прокси |
| `USE_SQLITE` | `false` | SQLite вместо JSON |
| `USE_NEW_FRONTEND` | `true` | React-фронтенд |
| `PANEL_ACCESS` | `nginx` | `nginx` / `direct` / `ssh-only` |
| `MASQUERADE_MODE` | `local` | `local` или `mirror` |
| `MASQUERADE_URL` | — | URL для режима mirror |
| `USE_CADDY_CERT` | `0` | Разделить сертификат Caddy с Hy2 |
| `USE_WARP` | `0` | Установить Cloudflare WARP |
| `REPO_BRANCH` | `main` | Ветка репозитория |

---

## Что устанавливается

| Компонент | Описание |
|---|---|
| **NaiveProxy** | TCP/443, маскировка под HTTPS (Caddy + forwardproxy) |
| **Hysteria2** | UDP/443, QUIC-прокси |
| **Панель управления** | React + Express, порт 3000 |
| **PM2** | Менеджер процессов для панели |
| **Node.js 20** | Рантайм для панели |
| **UFW** | Фаервол (22, 80, 443/tcp+udp) |
| **BBR + UDP-тюнинг** | Сетевые оптимизации |

---

## Возможности панели

### Управление пользователями
- Отдельные списки NaiveProxy и Hysteria2
- Срок действия ключей: 1/3/7/14/30/90/180/365 дней или бессрочно
- Автоматическое отключение по истечении (проверка каждые 5 мин)
- Готовые `naive+https://...` и `hysteria2://...` ссылки

### Управление сервисами
- Старт / стоп / рестарт каждого сервиса отдельно
- Диагностика: логи, проверка портов TCP/UDP 443
- Сетевой тюнинг (BBR + UDP-буферы) одной кнопкой

### Маскировка (camouflage)
- **Local** — статичная HTML-страница (надёжно)
- **Mirror** — зеркалирование внешнего сайта (iana.org, ietf.org)

### ACL и Bypass
- Загрузка гео-списков (geosite/geoip) для блокировки трафика
- Настраиваемые правила доступа

### Cloudflare WARP (опционально)
- Скрытые IP-определение через Cloudflare
- Split-tunnel: только указанные домены/CIDR через WARP
- Управление через панель (включение, домены, CIDR)

### Настройки
- Смена пароля панели
- SSH-only режим (панель только через SSH-туннель)
- Три режима доступа: Nginx :8080 / прямой :3000 / поддомен + HTTPS

---

## Требования

| Параметр | Значение |
|---|---|
| ОС | Ubuntu 20.04+ / Debian 11+ (только apt-based) |
| Архитектура | x86_64 / aarch64 / armv7l |
| Root | Обязателен |
| RAM | 1 ГБ (для сборки Caddy). 512 МБ — через swap |
| Ядро | 4.9+ (для BBR) |

### Порты

| Порт | Протокол | Сервис |
|---|---|---|
| 22 | TCP | SSH |
| 80 | TCP | Let's Encrypt ACME |
| 443 | TCP | NaiveProxy (Caddy) |
| 443 | UDP | Hysteria2 |
| 3000 | TCP | Панель (внутренняя) |
| 8080 | TCP | Панель через Nginx |
| 9999 | TCP | Hysteria2 stats |

---

## Сервисы на сервере

| Сервис | Systemd | Бинарник |
|---|---|---|
| NaiveProxy | `naive.service` | `/usr/local/bin/caddy-naive` |
| Hysteria2 | `hysteria.service` | `/usr/local/bin/hysteria` |
| Панель | `panel-naive-hy2` (PM2) | `server/index.js` |
| WARP (опц.) | `warp.service` | `/usr/bin/wg-quick` |

---

## Управление после установки

```bash
# Панель
pm2 status
pm2 logs panel-naive-hy2
pm2 restart panel-naive-hy2

# NaiveProxy
systemctl status naive
systemctl restart naive
journalctl -u naive -f

# Hysteria2
systemctl status hysteria
systemctl restart hysteria
journalctl -u hysteria -f
```

---

## Скрипт обновления (update.sh)

Инкрементальные патчи поверх существующей установки. **НЕ трогает** пользователей, сертификаты, домены.

```bash
# Показать текущее состояние установки
sudo bash update.sh --status

# Режимы:
sudo bash update.sh                    # применить миграции
sudo bash update.sh --dry-run          # показать что будет сделано
sudo bash update.sh --repair           # регенерация конфигов из config.json
sudo bash update.sh --masquerade       # сменить режим маскировки
sudo bash update.sh --expose panel.yourdomain.com  # вернуть публичный доступ
sudo bash update.sh --ssh-only         # переключить в SSH-only режим
```

### Что делает update.sh

- Применяет миграции (SSH-only, masquerade, repair инфраструктура)
- `--status`: диагностика без root (версия, сервисы, TLS, порты)
- `--repair`: автобэкап + регенерация Caddyfile + Hy2 config + rollback при ошибке
- `--masquerade`: интерактивная смена local/mirror с перезапуском сервисов
- `--expose`: восстановление публичного доступа к панели через поддомен
- `--ssh-only`: скрытие панели от Интернета (доступ только через SSH-туннель)

---

## Скрипт удаления (uninstall.sh)

Полностью удаляет панель, Caddy, Hysteria2, Go, Nginx и все связанные конфиги.

```bash
# С подтверждением
sudo bash uninstall.sh

# Без вопросов (для автоматизации)
sudo bash uninstall.sh --yes

# Показать что будет удалено (ничего не трогая)
sudo bash uninstall.sh --dry-run
```

### Флаги

| Флаг | Описание |
|---|---|
| `--yes / -y` | Не спрашивать подтверждение |
| `--keep-nginx` | Не удалять пакет nginx |
| `--keep-go` | Не удалять Go и кэш сборки |
| `--dry-run` | Показать что будет удалено |

### Что НЕ удаляется

Node.js, PM2, UFW, базовые пакеты (curl, wget, git, openssl)

---

## Клиенты для подключения

### NaiveProxy

| Платформа | Приложение |
|---|---|
| iOS | [Karing](https://apps.apple.com/app/karing/id6472431552) |
| Android | [NekoBox](https://github.com/MatsuriDayo/NekoBoxForAndroid/releases) / Karing |
| Windows | Karing / [NekoRay](https://github.com/MatsuriDayo/nekoray/releases) / [v2rayN](https://github.com/2dust/v2rayN/releases) |

### Hysteria2

| Платформа | Приложение |
|---|---|
| iOS | [Karing](https://apps.apple.com/app/karing/id6472431552) / Shadowrocket |
| Android | [NekoBox](https://github.com/MatsuriDayo/NekoBoxForAndroid/releases) / Karing |
| Windows | [Nekoray](https://github.com/MatsuriDayo/nekoray/releases) / v2rayN / [Hiddify](https://github.com/hiddify/hiddify-app/releases) |
| macOS | Karing / Hiddify |
| Linux | [hysteria CLI](https://github.com/apernet/hysteria/releases) |

### Формат ссылок

```
naive+https://LOGIN:PASSWORD@your.domain.com:443
hysteria2://PASSWORD@your.domain.com:443?sni=your.domain.com
```

---

## Структура файлов на сервере

```
/opt/panel-naive-hy2/            # Репозиторий
├── vps_test_install.sh          # Основной установщик
├── install.sh                   # Установщик (legacy)
├── update.sh                    # Обновления и миграции
├── uninstall.sh                 # Удаление
├── panel/                       # Панель
│   ├── server/                  # Бэкенд (Express)
│   ├── src/                     # Фронтенд (React)
│   ├── dist/                    # Собранный фронтенд
│   └── data/                    # Конфиги (config.json, panel.db)

/etc/naive/Caddyfile             # Конфиг NaiveProxy
/etc/hysteria/config.yaml        # Конфиг Hysteria2
/etc/hysteria/acl.rules          # ACL правила Hy2
/var/lib/naive/traffic.json      # Трафик NaiveProxy
/usr/local/bin/caddy-naive       # Бинарник NaiveProxy
/usr/local/bin/hysteria          # Бинарник Hysteria2
/etc/wireguard/                  # WARP конфиги (опционально)
```

---

## Архитектура

См. [ARCHITECTURE.md](ARCHITECTURE.md) — полная техническая документация (API, конфиги, data flow).

См. [DEPLOY.md](DEPLOY.md) — деплой, обновление, откат, бэкапы.
