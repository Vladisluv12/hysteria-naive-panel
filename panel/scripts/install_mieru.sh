#!/bin/bash
# ═══════════════════════════════════════════════════════
#  mieru Auto-Installer v3 — by ProxyGate (multi-arch)
#  Panel Naive + Hysteria2 + mieru + VLESS
#  ENV: MIERU_DOMAIN, MIERU_USERNAME, MIERU_PASSWORD
# ═══════════════════════════════════════════════════════

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

DOMAIN="${MIERU_DOMAIN:-}"
USERNAME="${MIERU_USERNAME:-}"
PASSWORD="${MIERU_PASSWORD:-}"
PORT="${MIERU_PORT:-9443}"

if [[ -z "$DOMAIN" || -z "$PASSWORD" || -z "$USERNAME" ]]; then
  echo "ERROR: missing env MIERU_DOMAIN / MIERU_USERNAME / MIERU_PASSWORD"
  exit 1
fi

log()  { echo "$1"; }
step() { echo "STEP:$1"; }

case "$(uname -m)" in
  x86_64)  MIERU_ARCH="amd64" ;;
  aarch64) MIERU_ARCH="arm64" ;;
  armv7l)  MIERU_ARCH="armv7" ;;
  *)       MIERU_ARCH="amd64" ;;
esac
log "  Arch: $(uname -m) → mieru:${MIERU_ARCH}"

# ══════════════════════════════════════════════════════
step 1
log "▶ Установка зависимостей..."
# ══════════════════════════════════════════════════════

apt-get update -qq -o DPkg::Lock::Timeout=60 2>/dev/null || true
apt-get install -y -qq curl wget jq ufw ca-certificates 2>/dev/null || true
log "✅ Зависимости готовы"

# ══════════════════════════════════════════════════════
step 2
log "▶ Сетевой тюнинг..."
# ══════════════════════════════════════════════════════

cat > /etc/sysctl.d/99-proxygate-tune.conf << 'SYSCTLEOF'
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
net.core.rmem_max=16777216
net.core.wmem_max=16777216
SYSCTLEOF
sysctl --system >/dev/null 2>&1 || true
log "✅ Сетевой тюнинг применён"

# ══════════════════════════════════════════════════════
step 3
log "▶ Настройка файрволла..."
# ══════════════════════════════════════════════════════

ufw allow 22/tcp  >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow ${PORT}/tcp >/dev/null 2>&1 || true
echo "y" | ufw enable >/dev/null 2>&1 || ufw --force enable >/dev/null 2>&1 || true
log "✅ TCP/${PORT} открыт"

# ══════════════════════════════════════════════════════
step 4
log "▶ Загрузка mieru (arch: ${MIERU_ARCH})..."
# ══════════════════════════════════════════════════════

MIERU_VERSION=$(curl -fsSL --connect-timeout 10 \
  https://api.github.com/repos/enfein/mieru/releases/latest 2>/dev/null \
  | jq -r '.tag_name' 2>/dev/null || echo "")
[[ -z "$MIERU_VERSION" || "$MIERU_VERSION" == "null" ]] && MIERU_VERSION="v3.34.0"

log "  Версия: ${MIERU_VERSION}"
MIERU_VER_NUM="${MIERU_VERSION#v}"

# Try deb package first (sets up mita user + systemd unit)
DEB_URL="https://github.com/enfein/mieru/releases/download/${MIERU_VERSION}/mita_${MIERU_VER_NUM}_${MIERU_ARCH}.deb"
log "  Скачивание .deb..."

if wget -q --timeout=120 "${DEB_URL}" -O /tmp/mita.deb 2>/dev/null; then
  dpkg -i /tmp/mita.deb 2>/dev/null || {
    log "⚠ dpkg failed, extracting manually..."
    dpkg --force-all -i /tmp/mita.deb 2>/dev/null || true
  }
  rm -f /tmp/mita.deb
else
  # Fallback: download tar.gz and install manually
  log "  .deb не доступен, fallback → tar.gz"
  TAR_URL="https://github.com/enfein/mieru/releases/download/${MIERU_VERSION}/mita_${MIERU_VER_NUM}_linux_${MIERU_ARCH}.tar.gz"
  wget -q --timeout=120 "${TAR_URL}" -O /tmp/mieru.tar.gz || {
    log "ERROR: Не удалось скачать mieru!"
    exit 1
  }
  mkdir -p /tmp/mieru_extract
  tar xzf /tmp/mieru.tar.gz -C /tmp/mieru_extract 2>/dev/null || true
  miu_bin=$(find /tmp/mieru_extract -name 'mita' -type f 2>/dev/null | head -1)
  if [[ -z "$miu_bin" ]]; then
    log "ERROR: бинарник mita не найден в архиве"
    exit 1
  fi
  cp "$miu_bin" /usr/local/bin/mita
  chmod +x /usr/local/bin/mita
  setcap 'cap_net_bind_service=+ep' /usr/local/bin/mita 2>/dev/null || true
  rm -rf /tmp/mieru_extract /tmp/mieru.tar.gz

  # Create mita system user required by mita
  useradd -r -s /bin/false mita 2>/dev/null || true
fi

if [[ ! -x /usr/local/bin/mita ]] && [[ ! -x /usr/bin/mita ]]; then
  log "ERROR: mita binary not found!"
  exit 1
fi

MITA_BIN=$(which mita 2>/dev/null || echo /usr/local/bin/mita)
MIU_VER=$("$MITA_BIN" version 2>&1 | head -n1 || echo "unknown")
log "✅ mieru установлен: $MIU_VER"

# Ensure mita user exists (required for socket permissions)
useradd -r -s /bin/false mita 2>/dev/null || true

# ══════════════════════════════════════════════════════
step 5
log "▶ Создание конфига..."
# ══════════════════════════════════════════════════════

mkdir -p /etc/mita

# mieru v3 config: "name" + "password" fields for users
cat > /etc/mita/server.json << MIERUEOF
{
  "portBindings": [
    {
      "port": ${PORT},
      "protocol": "TCP"
    }
  ],
  "users": [
    {
      "name": "${USERNAME}",
      "password": "${PASSWORD}"
    }
  ],
  "loggingLevel": "INFO",
  "mtu": 1400,
  "trafficPattern": {
    "unlockAll": true,
    "nonce": {
      "type": "NONCE_TYPE_PRINTABLE",
      "minLen": 4,
      "maxLen": 8
    },
    "padding": {
      "maxMiddlePaddingLen": 64,
      "maxEndPaddingLen": 128
    }
  }
}
MIERUEOF

# Validate JSON syntax
if command -v python3 >/dev/null 2>&1; then
  python3 -c "import json; json.load(open('/etc/mita/server.json'))" && log "✅ JSON валиден" || log "⚠ JSON ошибка в /etc/mita/server.json"
fi

# ══════════════════════════════════════════════════════
step 6
log "▶ Systemd сервис mieru..."
# ══════════════════════════════════════════════════════

# If dpkg installed a systemd unit, keep it. Otherwise create one.
if [[ ! -f /etc/systemd/system/mita.service ]] && [[ ! -f /lib/systemd/system/mita.service ]]; then
  cat > /etc/systemd/system/mita.service << MITASVCEOF
[Unit]
Description=mieru Proxy Server
Documentation=https://github.com/enfein/mieru
After=network.target network-online.target
Requires=network-online.target
StartLimitIntervalSec=60s
StartLimitBurst=3

[Service]
Type=simple
User=root
Group=root
ExecStart=${MITA_BIN} run
Environment=MITA_CONFIG_JSON_FILE=/etc/mita/server.json
WorkingDirectory=/etc/mita
RuntimeDirectory=mita
LimitNOFILE=1048576
LimitNPROC=512
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
MITASVCEOF
fi

systemctl daemon-reload
systemctl enable mita >/dev/null 2>&1 || true
log "✅ Systemd сервис создан"

# ══════════════════════════════════════════════════════
step 7
log "▶ Запуск mieru..."
# ══════════════════════════════════════════════════════

systemctl restart mita 2>&1 || true

for i in $(seq 1 20); do
  STATUS=$(systemctl is-active mita 2>/dev/null || echo "unknown")
  if [[ "$STATUS" == "active" ]]; then
    log "✅ mieru daemon запущен (${i}с)"
    break
  elif [[ "$STATUS" == "failed" ]]; then
    log "⚠ mita daemon: failed — смотрите ниже:"
    journalctl -u mita -n 20 --no-pager 2>/dev/null || true
    log "  Попытка рестарта..."
    systemctl reset-failed mita 2>/dev/null || true
    systemctl start mita 2>/dev/null || true
    break
  fi
  sleep 1
  if [[ $i -eq 20 ]]; then
    log "⚠ mita daemon не запустился за 20с."
  fi
done

# Apply config and start proxy service
sleep 2
if systemctl is-active mita >/dev/null 2>&1; then
  "$MITA_BIN" apply config /etc/mita/server.json 2>/dev/null || true
  "$MITA_BIN" start 2>/dev/null || true
  sleep 1
  MSTATUS=$("$MITA_BIN" status 2>/dev/null | grep -c "RUNNING" || echo 0)
  if [[ "$MSTATUS" -gt 0 ]]; then
    log "✅ mieru proxy running"
  else
    log "⚠ proxy may not be running, check: mita status"
  fi
fi

step DONE
log ""
log "╔════════════════════════════════════════════════════╗"
log "║   ✅ mieru успешно установлен!                    ║"
log "║   Домен: ${DOMAIN}"
log "║   Порт: ${PORT}"
log "╚════════════════════════════════════════════════════╝"
log ""

exit 0
