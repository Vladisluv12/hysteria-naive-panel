#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Hysteria2 Installer — LOCAL TEST MODE (self-signed)
#  Panel Naive + Hysteria2 by RIXXX
#  ENV: HY_DOMAIN, HY_PASSWORD
#  (EMAIL не нужен — сертификат самоподписанный)
# ═══════════════════════════════════════════════════════

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

DOMAIN="${HY_DOMAIN:-}"
PASSWORD="${HY_PASSWORD:-}"
USE_CADDY_CERT="${USE_CADDY_CERT:-0}"

if [[ -z "$DOMAIN" || -z "$PASSWORD" ]]; then
  echo "ERROR: missing env HY_DOMAIN / HY_PASSWORD"
  exit 1
fi

log()  { echo "$1"; }
step() { echo "STEP:$1"; }

case "$(uname -m)" in
  x86_64)  HY_ARCH="amd64" ;;
  aarch64) HY_ARCH="arm64" ;;
  armv7l)  HY_ARCH="arm"   ;;
  *)       HY_ARCH="amd64" ;;
esac
log "  Arch: $(uname -m) → Hy2:${HY_ARCH}"

# ══════════════════════════════════════════════════════
step 1
log "▶ Установка зависимостей..."
# ══════════════════════════════════════════════════════

apt-get update -qq -o DPkg::Lock::Timeout=60 2>/dev/null || true
apt-get install -y -qq curl wget jq libcap2-bin ufw ca-certificates openssl 2>/dev/null || true
log "✅ Зависимости готовы"

# ══════════════════════════════════════════════════════
step 2
log "▶ UDP-оптимизации..."
# ══════════════════════════════════════════════════════

cat > /etc/sysctl.d/99-rixxx-tune.conf << 'SYSCTLEOF'
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.core.rmem_default=2500000
net.core.wmem_default=2500000
net.ipv4.tcp_fastopen=3
SYSCTLEOF
sysctl --system >/dev/null 2>&1 || true

log "✅ Сетевой тюнинг применён"

# ══════════════════════════════════════════════════════
step 3
log "▶ Настройка файрволла..."
# ══════════════════════════════════════════════════════

ufw allow 22/tcp  >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw allow 443/udp >/dev/null 2>&1 || true
echo "y" | ufw enable >/dev/null 2>&1 || ufw --force enable >/dev/null 2>&1 || true

log "✅ UDP/443 открыт"

# ══════════════════════════════════════════════════════
step 4
log "▶ Загрузка Hysteria2 (arch: ${HY_ARCH})..."
# ══════════════════════════════════════════════════════

HY_VERSION=$(curl -fsSL --connect-timeout 10 \
  https://api.github.com/repos/apernet/hysteria/releases/latest 2>/dev/null \
  | jq -r '.tag_name' 2>/dev/null || echo "")
[[ -z "$HY_VERSION" || "$HY_VERSION" == "null" ]] && HY_VERSION="app/v2.5.2"

log "  Версия: ${HY_VERSION}"
HY_URL="https://github.com/apernet/hysteria/releases/download/${HY_VERSION}/hysteria-linux-${HY_ARCH}"

wget -q --timeout=120 "${HY_URL}" -O /usr/local/bin/hysteria 2>&1 || {
  log "⚠ Не удалось скачать ${HY_VERSION}, fallback → app/v2.5.2"
  wget -q --timeout=120 \
    "https://github.com/apernet/hysteria/releases/download/app/v2.5.2/hysteria-linux-${HY_ARCH}" \
    -O /usr/local/bin/hysteria || {
    log "ERROR: Не удалось скачать hysteria!"
    exit 1
  }
}

if [[ ! -s /usr/local/bin/hysteria ]]; then
  log "ERROR: бинарник hysteria пустой"
  exit 1
fi

chmod +x /usr/local/bin/hysteria
setcap 'cap_net_bind_service=+ep' /usr/local/bin/hysteria 2>/dev/null || true

HY_VER=$(/usr/local/bin/hysteria version 2>&1 | head -n1 || echo "unknown")
log "✅ Hysteria2 установлена: $HY_VER"

# ══════════════════════════════════════════════════════
step 5
log "▶ Создание конфига + самоподписанный сертификат..."
# ══════════════════════════════════════════════════════

mkdir -p /etc/hysteria /etc/ssl/selfsigned

# Генерируем самоподписанный сертификат если его ещё нет
if [[ ! -f "/etc/ssl/selfsigned/${DOMAIN}.crt" ]]; then
  log "  Генерация самоподписанного сертификата для ${DOMAIN}..."
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "/etc/ssl/selfsigned/${DOMAIN}.key" \
    -out "/etc/ssl/selfsigned/${DOMAIN}.crt" \
    -subj "/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:127.0.0.1" \
    2>/dev/null

  chmod 644 "/etc/ssl/selfsigned/${DOMAIN}.crt"
  chmod 600 "/etc/ssl/selfsigned/${DOMAIN}.key"
fi
log "✅ Сертификат: /etc/ssl/selfsigned/${DOMAIN}.{crt,key}"

cat > /etc/hysteria/config.yaml << HYCFGEOF
# ═══════════════════════════════════════════════
#  Hysteria2 — LOCAL TEST (by RIXXX)
#  Самоподписанный сертификат, без ACME
# ═══════════════════════════════════════════════
listen: :443

auth:
  type: userpass
  userpass:
    default: "${PASSWORD}"

masquerade:
  type: file
  file:
    dir: /var/www/html

HYCFGEOF

# Убедимся что директория с HTML существует
mkdir -p /var/www/html
if [[ ! -f /var/www/html/index.html ]]; then
  cat > /var/www/html/index.html << 'MASQEOF'
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading</title>
<style>body{background:#080808;height:100vh;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif}.bar{width:200px;height:3px;background:#151515;overflow:hidden;border-radius:2px;margin-bottom:25px}.fill{height:100%;width:40%;background:#fff;animation:slide 1.4s infinite ease-in-out}@keyframes slide{0%{transform:translateX(-100%)}50%{transform:translateX(50%)}100%{transform:translateX(200%)}}.t{color:#555;font-size:13px;letter-spacing:3px;font-weight:600}</style>
</head><body><div class="bar"><div class="fill"></div></div><div class="t">LOADING CONTENT</div></body></html>
MASQEOF
fi

if [[ "$USE_CADDY_CERT" == "1" ]]; then
  # ── КРИТИЧНО: если Caddy уже запущен — освобождаем UDP/443
  if [[ -f /etc/caddy/Caddyfile ]] && ! grep -q "protocols h1 h2" /etc/caddy/Caddyfile; then
    log "  Отключаем HTTP/3 в Caddy (освобождаем UDP/443 для Hy2)..."
    cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%s)" 2>/dev/null || true

    PY_OK=0
    if command -v python3 >/dev/null 2>&1; then
      python3 << 'PYEOF' && PY_OK=1
import re, sys
p = '/etc/caddy/Caddyfile'
try:
    with open(p) as f:
        src = f.read()
    m = re.match(r'^\s*\{([^{}]*)\}', src, re.DOTALL)
    if m:
        inner = m.group(1)
        if 'protocols h1 h2' not in inner:
            new_inner = inner.rstrip() + '\n  servers {\n    protocols h1 h2\n  }\n'
            new_src = '{' + new_inner + '}' + src[m.end():]
            with open(p, 'w') as f:
                f.write(new_src)
            print("Caddyfile updated: HTTP/3 disabled")
    else:
        new_src = '{\n  servers {\n    protocols h1 h2\n  }\n}\n\n' + src
        with open(p, 'w') as f:
            f.write(new_src)
        print("Caddyfile updated: added global block with HTTP/3 disabled")
    sys.exit(0)
except Exception as e:
    print("python edit error:", e, file=sys.stderr)
    sys.exit(1)
PYEOF
    fi
    systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || true
    sleep 2
    log "✅ HTTP/3 в Caddy отключён, UDP/443 свободен"
  fi

  # Используем тот же самоподписанный сертификат что и Caddy
  if [[ -f "/etc/ssl/selfsigned/${DOMAIN}.crt" ]]; then
    log "  Используем общий самоподписанный сертификат..."
    chmod 644 "/etc/ssl/selfsigned/${DOMAIN}.crt" 2>/dev/null || true
    chmod 640 "/etc/ssl/selfsigned/${DOMAIN}.key" 2>/dev/null || true

    cat >> /etc/hysteria/config.yaml << HYTLSEOF
tls:
  cert: /etc/ssl/selfsigned/${DOMAIN}.crt
  key:  /etc/ssl/selfsigned/${DOMAIN}.key
HYTLSEOF
  else
    log "⚠ Сертификат не найден. Сначала запустите install_naiveproxy_test.sh"
    cat >> /etc/hysteria/config.yaml << 'HYNOTLSEOF'
# ⚠ Сертификат не был найден. Запустите сначала NaiveProxy (install_naiveproxy_test.sh)
# или сгенерируйте вручную: openssl req -x509 -nodes -days 365 ...
HYNOTLSEOF
  fi
else
  # Standalone Hy2: используем собственный самоподписанный сертификат
  cat >> /etc/hysteria/config.yaml << HYTLSEOF
tls:
  cert: /etc/ssl/selfsigned/${DOMAIN}.crt
  key:  /etc/ssl/selfsigned/${DOMAIN}.key
HYTLSEOF
fi

cat >> /etc/hysteria/config.yaml << 'HYBWEOF'

ignoreClientBandwidth: true

quic:
  initStreamReceiveWindow: 8388608
  maxStreamReceiveWindow: 8388608
  initConnReceiveWindow: 20971520
  maxConnReceiveWindow: 20971520
  maxIdleTimeout: 30s
  keepAlivePeriod: 10s
  disablePathMTUDiscovery: false
HYBWEOF

log "✅ Конфиг /etc/hysteria/config.yaml создан"

# ══════════════════════════════════════════════════════
step 6
log "▶ Systemd сервис Hysteria..."
# ══════════════════════════════════════════════════════

if [[ "$USE_CADDY_CERT" == "1" ]]; then
  HY_AFTER="After=network.target network-online.target caddy.service"
  HY_WANTS="Wants=caddy.service"
else
  HY_AFTER="After=network.target network-online.target"
  HY_WANTS=""
fi

cat > /etc/systemd/system/hysteria-server.service << HYSVCEOF
[Unit]
Description=Hysteria2 Server (by RIXXX — local test)
Documentation=https://v2.hysteria.network/
${HY_AFTER}
${HY_WANTS}
Requires=network-online.target
StartLimitIntervalSec=60s
StartLimitBurst=3

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/local/bin/hysteria server --config /etc/hysteria/config.yaml
WorkingDirectory=/etc/hysteria
LimitNOFILE=1048576
LimitNPROC=512
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
HYSVCEOF

systemctl daemon-reload
systemctl enable hysteria-server >/dev/null 2>&1 || true

log "✅ Systemd сервис создан"

# ══════════════════════════════════════════════════════
step 7
log "▶ Запуск Hysteria2..."
# ══════════════════════════════════════════════════════

systemctl restart hysteria-server 2>&1 || true

for i in $(seq 1 20); do
  STATUS=$(systemctl is-active hysteria-server 2>/dev/null || echo "unknown")
  if [[ "$STATUS" == "active" ]]; then
    log "✅ Hysteria2 запущена (${i}с)"
    break
  elif [[ "$STATUS" == "failed" ]]; then
    log "⚠ hysteria-server: failed — смотрите ниже:"
    journalctl -u hysteria-server -n 20 --no-pager 2>/dev/null || true
    log "  Попытка рестарта..."
    systemctl reset-failed hysteria-server 2>/dev/null || true
    systemctl start hysteria-server 2>/dev/null || true
    break
  fi
  sleep 1
  if [[ $i -eq 20 ]]; then
    log "⚠ Hy2 не запустилась за 20с. Команда для диагностики:"
    log "  journalctl -u hysteria-server -n 50 --no-pager"
  fi
done

step "done"
log ""
log "╔════════════════════════════════════════════════════╗"
log "║   ✅ Hysteria2 (LOCAL TEST) установлен!            ║"
log "║   Домен: ${DOMAIN}"
log "║   Сертификат: САМОПОДПИСАННЫЙ"
log "║   hysteria2://****@${DOMAIN}:443?sni=${DOMAIN}"
log "╚════════════════════════════════════════════════════╝"
log ""

exit 0
