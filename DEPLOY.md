# Деплой и откат RIXXX Panel (Naive + Hysteria2)

---

## Структура на сервере

```
/opt/panel-naive-hy2/panel/          ← панель (Node.js + React)
├── data/
│   ├── panel.db                     ← SQLite (пользователи, мета-таблица)
│   └── config.json                  ← конфиг (домен, creds, список юзеров)
├── server/                          ← бэкенд (Express)
├── dist/                            ← собранный фронтенд (React)
└── public/                          ← legacy фронтенд

/etc/naive/Caddyfile                 ← конфиг NaiveProxy
/etc/hysteria/config.yaml            ← конфиг Hysteria2
/etc/hysteria/acl.rules              ← ACL правила Hy2
/var/lib/naive/traffic.json          ← трафик NaiveProxy
/usr/local/bin/caddy-naive           ← бинарник NaiveProxy
```

## Процессы

| Сервис       | Менеджер | Имя в PM2 / systemd        |
|-------------|----------|-----------------------------|
| Панель       | PM2      | `panel-naive-hy2`           |
| NaiveProxy   | systemd  | `naive.service`             |
| Hysteria2    | systemd  | `hysteria.service`          |

---

## 1. Бэкап ПЕРЕД обновлением

```bash
BACKUP_DIR="/root/panel-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Данные панели (БД + конфиг)
cp -a /opt/panel-naive-hy2/panel/data/panel.db "$BACKUP_DIR/"
cp -a /opt/panel-naive-hy2/panel/data/config.json "$BACKUP_DIR/"

# Конфиги сервисов
cp /etc/naive/Caddyfile "$BACKUP_DIR/"
cp /etc/hysteria/config.yaml "$BACKUP_DIR/"
cp /etc/hysteria/acl.rules "$BACKUP_DIR/" 2>/dev/null || true

# Трафик
cp /var/lib/naive/traffic.json "$BACKUP_DIR/" 2>/dev/null || true

# Полный бэкап панели (на случай кривого деплоя)
tar czf "$BACKUP_DIR/panel-full.tar.gz" -C /opt/panel-naive-hy2 panel/

echo "Бэкап: $BACKUP_DIR"
ls -la "$BACKUP_DIR/"
```

---

## 2. Обновление панели (фронтенд + бэкенд)

### Вариант А — через git (рекомендуется)

```bash
cd /opt/panel-naive-hy2
git pull origin main

# Собрать фронтенд (если есть изменения в React)
cd panel
npm ci --omit=dev          # только prod-зависимости
npm run build              # tsc + vite build → dist/

# Перезапустить
pm2 restart panel-naive-hy2
pm2 save
```

### Вариант Б — ручной деплой через tar

На локальной машине:
```bash
cd panel/
tar czf /tmp/panel-deploy.tar.gz \
  dist/ \
  server/ \
  public/ \
  package.json \
  package-lock.json
```

На сервере:
```bash
# Остановить панель
pm2 stop panel-naive-hy2

# Распаковать
cd /opt/panel-naive-hy2/panel
tar xzf /tmp/panel-deploy.tar.gz

# Зависимости (только если изменился package.json)
npm ci --omit=dev

# Запустить
pm2 start panel-naive-hy2
pm2 save
```

> **Важно:** файлы `data/panel.db` и `data/config.json` **не затираются** — они лежат отдельно от кода.

---

## 3. Обновление серверных компонентов

### NaiveProxy (caddy-naive)

```bash
# Скачать новую версию (пример для amd64)
wget -O /tmp/caddy-naive https://github.com/nicpottier/caddy-naive/releases/latest/download/caddy_linux_amd64
chmod +x /tmp/caddy-naive
mv /usr/local/bin/caddy-naive /usr/local/bin/caddy-naive.old
mv /tmp/caddy-naive /usr/local/bin/caddy-naive

# Перезапустить
systemctl restart naive
```

### Hysteria2

```bash
# Скачать новую версию
wget -O /tmp/hysteria https://github.com/apernet/hysteria/releases/latest/download/hysteria-linux-amd64
chmod +x /tmp/hysteria
mv /usr/local/bin/hysteria /usr/local/bin/hysteria.old
mv /tmp/hysteria /usr/local/bin/hysteria

# Перезапустить
systemctl restart hysteria
```

> Конфиги `/etc/naive/Caddyfile` и `/etc/hysteria/config.yaml` **не меняются** при обновлении бинарников.

---

## 4. Проверка после обновления

```bash
# Статус сервисов
systemctl is-active naive && echo "Naive: OK" || echo "Naive: DOWN"
systemctl is-active hysteria && echo "Hy2: OK" || echo "Hy2: DOWN"
pm2 status panel-naive-hy2

# Быстрая проверка панели
curl -s http://127.0.0.1:3000/api/me | head -c 100

# Проверка что юзеры на месте
curl -s -H "Authorization: Bearer $(curl -s -X POST http://127.0.0.1:3000/api/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin"}' | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')" \
  http://127.0.0.1:3000/api/naive/users | python3 -m json.tool | head -20

# Проверка что лицензия не сломалась
curl -Ik https://olmeccca.duckdns.org:8443 2>&1 | head -5
```

---

## 5. Откат

### Откат панели

```bash
BACKUP_DIR="/root/panel-backup-YYYYMMDD-HHMMSS"   # подставить свою папку

# Восстановить данные
cp "$BACKUP_DIR/panel.db" /opt/panel-naive-hy2/panel/data/
cp "$BACKUP_DIR/config.json" /opt/panel-naive-hy2/panel/data/

# Или полностью восстановить панель из полного бэкапа
pm2 stop panel-naive-hy2
rm -rf /opt/panel-naive-hy2/panel
tar xzf "$BACKUP_DIR/panel-full.tar.gz" -C /opt/panel-naive-hy2/

# Запустить
cd /opt/panel-naive-hy2/panel
npm ci --omit=dev
pm2 start panel-naive-hy2
pm2 save
```

### Откат NaiveProxy

```bash
# Если оставляли .old
mv /usr/local/bin/caddy-naive.old /usr/local/bin/caddy-naive
systemctl restart naive
```

### Откат Hysteria2

```bash
mv /usr/local/bin/hysteria.old /usr/local/bin/hysteria
systemctl restart hysteria
```

### Откат конфигов сервисов

```bash
BACKUP_DIR="/root/panel-backup-YYYYMMDD-HHMMSS"

cp "$BACKUP_DIR/Caddyfile" /etc/naive/Caddyfile
systemctl restart naive

cp "$BACKUP_DIR/config.yaml" /etc/hysteria/config.yaml
systemctl restart hysteria
```

### Откат через git

```bash
cd /opt/panel-naive-hy2
git log --oneline -10          # найти нужный коммит
git checkout <commit-hash>     # откат к конкретному коммиту

cd panel
npm ci --omit=dev
npm run build
pm2 restart panel-naive-hy2
pm2 save
```

---

## 6. Хранение бэкапов

Бэкапы хранятся в `/root/panel-backup-*`. Рекомендуется хранить **минимум 3 последних**:

```bash
# Автоочистка старых бэкапов (оставить 3 последних)
ls -dt /root/panel-backup-* | tail -n +4 | xargs rm -rf 2>/dev/null || true
```

> Панель сама делает `.bak` копии `config.json` перед каждым сохранением (до 5 штук) — это автобэкапы внутри `storage.js`, их хранить не нужно.

---

## Что НЕ теряется при любом обновлении

| Что | Где | Почему безопасно |
|-----|-----|-------------------|
| Пользователи (Naive/Hy2) | `config.json` / `panel.db` | Лежат в `data/`, не перезаписываются кодом |
| Логины/пароли админки | `panel.db` (`meta` таблица) | SQLite не трогается при деплое |
| Трафик | `/var/lib/naive/traffic.json` | Вне директории панели |
| TLS-сертификаты | `/var/lib/caddy/...` | ЛетсЭнкрипт, обновляется автоматически |
| Конфиги сервисов | `/etc/naive/`, `/etc/hysteria/` | Не перезаписываются `git pull` |
| ACL правила | `/etc/hysteria/acl.rules` | Не перезаписываются кодом |
| Скрипт тюнинга | `/etc/sysctl.d/99-panel-tuning.conf` | Sysctl persistence, не трогается |
