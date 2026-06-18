#!/bin/bash
# vps_test_install.sh — Deploy NaiveProxy + Hysteria2 on port 8443 (self-signed)
# Usage:
#   chmod +x vps_test_install.sh
#   sudo DOMAIN="vps.example.com" NAIVE_USER="user1" NAIVE_PASS="pass1" HY2_PASS="pass2" bash vps_test_install.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
log_step() { echo -e "\n${CYAN}${BOLD}[$1]${RESET} $2"; }
log_ok()   { echo -e "${GREEN}  OK${RESET} $1"; }
log_warn() { echo -e "${YELLOW}  WARN${RESET} $1"; }
die()      { echo -e "${RED}  FAIL${RESET} $1"; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root"
: "${DOMAIN:?Set DOMAIN env var}"
: "${NAIVE_USER:?Set NAIVE_USER env var}"
: "${NAIVE_PASS:?Set NAIVE_PASS env var}"
: "${HY2_PASS:?Set HY2_PASS env var}"

case "$(uname -m)" in
  x86_64)  GO_ARCH="amd64"  ;; aarch64) GO_ARCH="arm64"  ;;
  armv7l)  GO_ARCH="armv6l" ;; *)       GO_ARCH="amd64"  ;;
esac

# ──── [1/10] Dependencies ──────────────────────────────────────────────
log_step "1/10" "Installing dependencies..."
rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock 2>/dev/null || true
dpkg --configure -a >/dev/null 2>&1 || true
apt-get update -qq -o DPkg::Lock::Timeout=60 2>/dev/null || true
apt-get install -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
  -o DPkg::Lock::Timeout=60 curl wget git openssl build-essential libcap2-bin jq ca-certificates ufw 2>/dev/null || \
  die "Failed to install dependencies"
log_ok "Dependencies installed"

# ──── [2/10] Install Go ────────────────────────────────────────────────
log_step "2/10" "Installing Go (arch: ${GO_ARCH})..."
if [[ ! -f /usr/local/go/bin/go ]]; then
  curl -fsSL --connect-timeout 10 --max-time 300 \
    "https://go.dev/dl/go1.22.12.linux-${GO_ARCH}.tar.gz" -o /tmp/go.tar.gz || die "Failed to download Go"
  tar -C /usr/local -xzf /tmp/go.tar.gz && rm -f /tmp/go.tar.gz
  grep -q "/usr/local/go/bin" /root/.profile 2>/dev/null || {
    echo 'export PATH=$PATH:/usr/local/go/bin:/root/go/bin' >> /root/.profile
    echo 'export GOPATH=/root/go' >> /root/.profile
  }
fi
export PATH=$PATH:/usr/local/go/bin:/root/go/bin GOPATH=/root/go GOROOT=/usr/local/go
log_ok "Go installed: $(go version 2>/dev/null || echo ok)"

# ──── [3/10] Build Caddy + NaiveProxy ──────────────────────────────────
log_step "3/10" "Building Caddy + NaiveProxy (3-7 min)..."
export GOROOT=/usr/local/go GOPATH=/root/go PATH=$GOROOT/bin:$GOPATH/bin:$PATH
export TMPDIR=/root/tmp GOPROXY=https://proxy.golang.org,direct
mkdir -p /root/tmp /root/go

go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest 2>&1 | tail -2
[[ -f /root/go/bin/xcaddy ]] || die "xcaddy not installed"

cd /root && rm -f /root/caddy
/root/go/bin/xcaddy build \
  --with github.com/caddyserver/forwardproxy=https://github.com/Vladisluv12/caddy_addon \
  2>&1 | while IFS= read -r line; do [[ -n "$line" ]] && echo "    $line"; done

[[ -f /root/caddy ]] || die "Caddy build failed"
mv /root/caddy /usr/local/bin/caddy-naive && chmod +x /usr/local/bin/caddy-naive
setcap 'cap_net_bind_service=+ep' /usr/local/bin/caddy-naive 2>/dev/null || true
log_ok "Caddy built"

# ──── [4/10] Download Hysteria2 ────────────────────────────────────────
log_step "4/10" "Downloading Hysteria2..."
rm -f /usr/local/bin/hysteria
curl -fsSL --connect-timeout 10 --max-time 120 \
  "https://github.com/apernet/hysteria/releases/latest/download/hysteria-linux-amd64" \
  -o /usr/local/bin/hysteria || die "Failed to download hysteria"
chmod +x /usr/local/bin/hysteria
setcap 'cap_net_bind_service=+ep' /usr/local/bin/hysteria 2>/dev/null || true
log_ok "Hysteria2 installed"

# ──── [5/10] Self-signed cert ──────────────────────────────────────────
log_step "5/10" "Generating self-signed certificate..."
mkdir -p /etc/ssl/selfsigned
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/ssl/selfsigned/server.key \
  -out /etc/ssl/selfsigned/server.crt \
  -subj "/CN=${DOMAIN}" \
  -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:127.0.0.1" 2>/dev/null || \
  die "Failed to generate certificate"
chmod 644 /etc/ssl/selfsigned/server.crt
chmod 600 /etc/ssl/selfsigned/server.key
log_ok "Self-signed certificate created for ${DOMAIN}"

# ──── [6/10] Camouflage page ───────────────────────────────────────────
log_step "6/10" "Creating camouflage page..."
mkdir -p /var/www/naive
cat > /var/www/naive/index.html << 'EOF'
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading</title>
<style>body{background:#080808;height:100vh;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif}.bar{width:200px;height:3px;background:#151515;overflow:hidden;border-radius:2px;margin-bottom:25px}.fill{height:100%;width:40%;background:#fff;animation:slide 1.4s infinite ease-in-out}@keyframes slide{0%{transform:translateX(-100%)}50%{transform:translateX(50%)}100%{transform:translateX(200%)}}.t{color:#555;font-size:13px;letter-spacing:3px;font-weight:600}</style>
</head><body><div class="bar"><div class="fill"></div></div><div class="t">LOADING CONTENT</div></body></html>
EOF
log_ok "Camouflage page created"

# ──── [7/10] Configs ───────────────────────────────────────────────────
log_step "7/10" "Writing configuration files..."
mkdir -p /etc/naive /etc/hysteria
touch /etc/naive/traffic.json
chown caddy:caddy /etc/naive/traffic.json 2>/dev/null || chown nobody:nogroup /etc/naive/traffic.json 2>/dev/null || true

cat > /etc/naive/Caddyfile << CADDYEOF
{
    order forward_proxy before file_server
    servers {
        protocols h1 h2
    }
}

:8443, ${DOMAIN} {
    tls /etc/ssl/selfsigned/server.crt /etc/ssl/selfsigned/server.key

    forward_proxy {
        basic_auth ${NAIVE_USER} ${NAIVE_PASS}
        hide_ip
        hide_via
        probe_resistance
        traffic_file /etc/naive/traffic.json
    }

    file_server {
        root /var/www/naive
    }
}
CADDYEOF

cat > /etc/hysteria/config.yaml << HYEOF
listen: :8443

tls:
  cert: /etc/ssl/selfsigned/server.crt
  key: /etc/ssl/selfsigned/server.key

auth:
  type: userpass
  userpass:
    default: "${HY2_PASS}"

masquerade:
  type: file
  file:
    dir: /var/www/naive

ignoreClientBandwidth: true

trafficStats:
  listen: :9999

quic:
  initStreamReceiveWindow: 8388608
  maxStreamReceiveWindow: 8388608
  initConnReceiveWindow: 20971520
  maxConnReceiveWindow: 20971520
  maxIdleTimeout: 30s
  keepAlivePeriod: 10s
HYEOF

log_ok "Configs written"

# ──── [8/10] Systemd services ──────────────────────────────────────────
log_step "8/10" "Creating systemd services..."
systemctl stop naive hysteria 2>/dev/null || true

cat > /etc/systemd/system/naive.service << 'SVCEOF'
[Unit]
Description=NaiveProxy (Caddy + forwardproxy)
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=root
Group=root
ExecStart=/usr/local/bin/caddy-naive run --config /etc/naive/Caddyfile
ExecReload=/usr/local/bin/caddy-naive reload --config /etc/naive/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
LimitNPROC=512
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF

cat > /etc/systemd/system/hysteria.service << HYSVCEOF
[Unit]
Description=Hysteria2 Server
After=network.target network-online.target naive.service
Wants=naive.service
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
log_ok "Systemd services created"

# ──── [9/10] Firewall ─────────────────────────────────────────────────
log_step "9/10" "Configuring UFW..."
ufw allow 22/tcp   >/dev/null 2>&1 || true
ufw allow 8443/tcp >/dev/null 2>&1 || true
ufw allow 8443/udp >/dev/null 2>&1 || true
echo "y" | ufw enable >/dev/null 2>&1 || ufw --force enable >/dev/null 2>&1 || true
log_ok "UFW: 8443/tcp+udp open"

# ──── [10/10] Start services ──────────────────────────────────────────
log_step "10/10" "Enabling and starting services..."
systemctl enable --now naive 2>&1 || log_warn "naive failed — journalctl -u naive"
systemctl enable --now hysteria 2>&1 || log_warn "hysteria failed — journalctl -u hysteria"

for svc in naive hysteria; do
  for i in $(seq 1 15); do
    systemctl is-active --quiet "$svc" 2>/dev/null && { log_ok "$svc running (${i}s)"; break; }
    sleep 1
    [[ $i -eq 15 ]] && log_warn "$svc slow — journalctl -u $svc"
  done
done

# ──── Summary ──────────────────────────────────────────────────────────
cat << SUMMARY

============================================
${GREEN}${BOLD}INSTALLATION COMPLETE${RESET}
============================================
Domain: ${DOMAIN}
Port: 8443

NaiveProxy:
  ${GREEN}naive+https://${NAIVE_USER}:${NAIVE_PASS}@${DOMAIN}:8443${RESET}
  Traffic stats: /etc/naive/traffic.json

Hysteria2:
  ${GREEN}hysteria2://default:${HY2_PASS}@${DOMAIN}:8443?sni=${DOMAIN}&insecure=1${RESET}

Sing-box naive:
  {"type":"naive","server":"${DOMAIN}","server_port":8443,"username":"${NAIVE_USER}","password":"${NAIVE_PASS}","tls":{"enabled":true,"insecure":true,"server_name":"${DOMAIN}"}}

Sing-box hysteria2:
  {"type":"hysteria2","server":"${DOMAIN}","server_port":8443,"password":"${HY2_PASS}","tls":{"enabled":true,"insecure":true,"server_name":"${DOMAIN}"}}
============================================
SUMMARY

exit 0
