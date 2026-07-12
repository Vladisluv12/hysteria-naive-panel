#!/bin/bash
# ═══════════════════════════════════════════════════════
#  VLESS (Xray) Auto-Installer — by ProxyGate (multi-arch)
#  Panel Naive + Hysteria2 + mieru + VLESS
#  ENV: VLESS_DOMAIN, VLESS_USERNAME, VLESS_PASSWORD, VLESS_UUID
# ═══════════════════════════════════════════════════════

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

DOMAIN="${VLESS_DOMAIN:-}"
USERNAME="${VLESS_USERNAME:-}"
PASSWORD="${VLESS_PASSWORD:-}"
UUID="${VLESS_UUID:-}"
PORT="${VLESS_PORT:-10443}"
ENCRYPTION_ENABLED="${VLESS_ENCRYPTION:-0}"

if [[ -z "$DOMAIN" || -z "$PASSWORD" || -z "$USERNAME" || -z "$UUID" ]]; then
  echo "ERROR: missing env VLESS_DOMAIN / VLESS_USERNAME / VLESS_PASSWORD / VLESS_UUID"
  exit 1
fi

log()  { echo "$1"; }
step() { echo "STEP:$1"; }

case "$(uname -m)" in
  x86_64)  XRAY_ARCH="64"    ;;
  aarch64) XRAY_ARCH="arm64-v8a" ;;
  armv7l)  XRAY_ARCH="arm32-v7a" ;;
  *)       XRAY_ARCH="64" ;;
esac
log "  Arch: $(uname -m) → Xray:${XRAY_ARCH}"

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

modprobe tcp_bbr 2>/dev/null || true
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
log "▶ Загрузка Xray (arch: ${XRAY_ARCH})..."
# ══════════════════════════════════════════════════════

XRAY_VERSION=$(curl -fsSL --connect-timeout 10 \
  https://api.github.com/repos/XTLS/Xray-core/releases/latest 2>/dev/null \
  | jq -r '.tag_name' 2>/dev/null || echo "")
[[ -z "$XRAY_VERSION" || "$XRAY_VERSION" == "null" ]] && XRAY_VERSION="v1.8.21"

log "  Версия: ${XRAY_VERSION}"
XRAY_URL="https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-${XRAY_ARCH}.zip"

wget -q --timeout=120 "${XRAY_URL}" -O /tmp/xray.zip 2>&1 || {
  log "⚠ Не удалось скачать ${XRAY_VERSION}, fallback → v1.8.21"
  wget -q --timeout=120 \
    "https://github.com/XTLS/Xray-core/releases/download/v1.8.21/Xray-linux-${XRAY_ARCH}.zip" \
    -O /tmp/xray.zip || {
    log "ERROR: Не удалось скачать Xray!"
    exit 1
  }
}

apt-get install -y -qq unzip 2>/dev/null || true

if command -v unzip >/dev/null 2>&1; then
  unzip -o /tmp/xray.zip -d /tmp/xray_extract 2>/dev/null || true
else
  python3 -c "import zipfile; zipfile.ZipFile('/tmp/xray.zip').extractall('/tmp/xray_extract')" 2>/dev/null || true
fi

if [[ ! -f /tmp/xray_extract/xray ]]; then
  log "ERROR: xray binary not found in archive"
  exit 1
fi

cp /tmp/xray_extract/xray /usr/local/bin/xray
chmod +x /usr/local/bin/xray
setcap 'cap_net_bind_service=+ep' /usr/local/bin/xray 2>/dev/null || true
rm -rf /tmp/xray_extract /tmp/xray.zip

XRAY_VER=$(/usr/local/bin/xray version 2>&1 | head -n1 || echo "unknown")
log "✅ Xray установлен: $XRAY_VER"

# Copy geo datasets if they exist from Hysteria2
mkdir -p /etc/xray
if [[ -f /etc/hysteria/geoip.dat ]]; then
  cp /etc/hysteria/geoip.dat /etc/xray/geoip.dat 2>/dev/null || true
  log "  geoip.dat скопирован из /etc/hysteria/"
fi
if [[ -f /etc/hysteria/geosite.dat ]]; then
  cp /etc/hysteria/geosite.dat /etc/xray/geosite.dat 2>/dev/null || true
  log "  geosite.dat скопирован из /etc/hysteria/"
fi

# ══════════════════════════════════════════════════════
step 5
log "▶ Генерация REALITY ключей..."
# ══════════════════════════════════════════════════════

REALITY_OUTPUT=$(/usr/local/bin/xray x25519 2>/dev/null)
REALITY_PRIVATE=$(echo "$REALITY_OUTPUT" | grep '^PrivateKey:' | awk '{print $2}')
REALITY_PUBLIC=$(echo "$REALITY_OUTPUT" | grep 'PublicKey' | awk '{print $NF}')

if [[ -z "$REALITY_PRIVATE" || -z "$REALITY_PUBLIC" ]]; then
  log "⚠ Ошибка генерации x25519, пробуем ещё раз..."
  REALITY_OUTPUT=$(/usr/local/bin/xray x25519 2>/dev/null)
  REALITY_PRIVATE=$(echo "$REALITY_OUTPUT" | grep '^PrivateKey:' | awk '{print $2}')
  REALITY_PUBLIC=$(echo "$REALITY_OUTPUT" | grep 'PublicKey' | awk '{print $NF}')
fi

REALITY_TARGET="${VLESS_REALITY_TARGET:-${DOMAIN}:443}"
REALITY_SNI="${DOMAIN}"

log "  PrivateKey: ${REALITY_PRIVATE:0:8}..."
log "  PublicKey:  ${REALITY_PUBLIC:0:8}..."
log "  Target:     ${REALITY_TARGET}"

# Output keys for panel to parse from stdout
echo "REALITY_PRIVATE_KEY=${REALITY_PRIVATE}"
echo "REALITY_PUBLIC_KEY=${REALITY_PUBLIC}"

# ══════════════════════════════════════════════════════
step 5a
log "▶ VLESS Encryption (PR 5067, опционально)..."
# ══════════════════════════════════════════════════════

VLESS_DECRYPTION="none"
VLESS_ENCRYPTION_STR=""
if [[ "$ENCRYPTION_ENABLED" == "1" ]]; then
  VLESSENC_OUTPUT=$(/usr/local/bin/xray vlessenc 2>/dev/null)
  VLESS_DECRYPTION=$(echo "$VLESSENC_OUTPUT" | grep -i '^Decryption:' | awk '{print $2}')
  VLESS_ENCRYPTION_STR=$(echo "$VLESSENC_OUTPUT" | grep -i '^Encryption:' | awk '{print $2}')
  if [[ -z "$VLESS_DECRYPTION" || -z "$VLESS_ENCRYPTION_STR" ]]; then
    log "⚠ Не удалось сгенерировать VLESS encryption, откат на decryption=none"
    VLESS_DECRYPTION="none"
    VLESS_ENCRYPTION_STR=""
  else
    log "  Decryption: ${VLESS_DECRYPTION:0:24}..."
    log "  Encryption: ${VLESS_ENCRYPTION_STR:0:24}..."
    echo "VLESS_DECRYPTION=${VLESS_DECRYPTION}"
    echo "VLESS_ENCRYPTION_STR=${VLESS_ENCRYPTION_STR}"
  fi
else
  log "  Отключено (VLESS_ENCRYPTION=1 для включения)"
fi

# ══════════════════════════════════════════════════════
step 5b
log "▶ Создание конфига Xray (REALITY)..."
# ══════════════════════════════════════════════════════

cat > /etc/xray/config.json << XRAYEOF
{
  "log": {
    "loglevel": "warning"
  },
  "stats": {},
  "policy": {
    "levels": { "0": { "statsUserUplink": true, "statsUserDownlink": true } },
    "system": { "statsInboundUplink": true, "statsInboundDownlink": true }
  },
  "api": { "tag": "api", "services": ["StatsService"] },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": ${PORT},
      "protocol": "vless",
      "tag": "vless-in",
      "settings": {
        "clients": [
          {
            "id": "${UUID}",
            "email": "${USERNAME}",
            "flow": ""
          }
        ],
        "decryption": "${VLESS_DECRYPTION}"
      },
      "streamSettings": {
        "network": "xhttp",
        "security": "reality",
        "realitySettings": {
          "target": "${REALITY_TARGET}",
          "serverNames": ["${REALITY_SNI}"],
          "privateKey": "${REALITY_PRIVATE}",
          "shortIds": [""]
        },
        "xhttpSettings": {
          "mode": "packet-up",
          "path": "/xhttp"
        }
      }
    },
    {
      "listen": "127.0.0.1",
      "port": 10085,
      "protocol": "dokodemo-door",
      "settings": { "address": "127.0.0.1" },
      "tag": "api"
    }
  ],
  "outbounds": [
    {"protocol": "freedom", "tag": "direct"},
    {"protocol": "freedom", "tag": "api"}
  ],
  "routing": {
    "rules": [{"type": "field", "inboundTag": ["api"], "outboundTag": "api"}]
  }
}
XRAYEOF

log "✅ Конфиг /etc/xray/config.json создан (REALITY)"

# Symlink /usr/local/etc/xray/config.json → /etc/xray/config.json
# This handles the case where the official XTLS install script
# overrides the systemd service to use /usr/local/etc/xray/config.json
mkdir -p /usr/local/etc/xray
ln -sf /etc/xray/config.json /usr/local/etc/xray/config.json
log "✅ Симлинк /usr/local/etc/xray/config.json → /etc/xray/config.json"

# ══════════════════════════════════════════════════════
step 6
log "▶ Systemd сервис Xray..."
# ══════════════════════════════════════════════════════

cat > /etc/systemd/system/xray.service << XRAYSVCEOF
[Unit]
Description=Xray Service (VLESS)
Documentation=https://xtls.github.io/
After=network.target network-online.target
Requires=network-online.target
StartLimitIntervalSec=60s
StartLimitBurst=3

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/local/bin/xray run -config /etc/xray/config.json
WorkingDirectory=/etc/xray
LimitNOFILE=1048576
LimitNPROC=512
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
XRAYSVCEOF

# Remove any drop-in overrides that redirect to wrong config path
rm -rf /etc/systemd/system/xray.service.d 2>/dev/null || true

systemctl daemon-reload
systemctl enable xray >/dev/null 2>&1 || true
log "✅ Systemd сервис создан"

# ══════════════════════════════════════════════════════
step 7
log "▶ Запуск Xray..."
# ══════════════════════════════════════════════════════

systemctl restart xray 2>&1 || true

for i in $(seq 1 20); do
  STATUS=$(systemctl is-active xray 2>/dev/null || echo "unknown")
  if [[ "$STATUS" == "active" ]]; then
    log "✅ Xray запущен (${i}с)"
    break
  elif [[ "$STATUS" == "failed" ]]; then
    log "⚠ xray: failed — смотрите ниже:"
    journalctl -u xray -n 20 --no-pager 2>/dev/null || true
    log "  Попытка рестарта..."
    systemctl reset-failed xray 2>/dev/null || true
    systemctl start xray 2>/dev/null || true
    break
  fi
  sleep 1
  if [[ $i -eq 20 ]]; then
    log "⚠ Xray не запустился за 20с."
  fi
done

LINK_ENCRYPTION="none"
[[ -n "$VLESS_ENCRYPTION_STR" ]] && LINK_ENCRYPTION="${VLESS_ENCRYPTION_STR}"

step DONE
log ""
log "╔════════════════════════════════════════════════════╗"
log "║   ✅ VLESS (Xray) + REALITY установлен!           ║"
log "║   Домен: ${DOMAIN}"
log "║   PrivateKey: ${REALITY_PRIVATE}"
log "║   PublicKey:  ${REALITY_PUBLIC}"
log "║   Target:     ${REALITY_TARGET}"
[[ "$ENCRYPTION_ENABLED" == "1" ]] && log "║   VLESS Encryption: ${LINK_ENCRYPTION}"
log "║   vless://${UUID}@${DOMAIN}:${PORT}?encryption=${LINK_ENCRYPTION}&security=reality&sni=${REALITY_SNI}&fp=chrome&type=xhttp&path=/xhttp&mode=packet-up&pbk=${REALITY_PUBLIC}#${USERNAME}"
log "╚════════════════════════════════════════════════════╝"
log ""

exit 0
