#!/bin/bash
# vps_test_install.sh — Deploy NaiveProxy + Hysteria2 on port 8443 (self-signed)
# Auto mode:   sudo DOMAIN="vps.example.com" NAIVE_USER="u1" NAIVE_PASS="p1" HY2_PASS="p2" bash vps_test_install.sh
# Interactive: sudo bash vps_test_install.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

REPO_URL="https://github.com/Vladisluv12/hysteria-naive-panel"
REPO_BRANCH="${REPO_BRANCH:-main}"
PANEL_DIR="/opt/panel-naive-hy2"
SERVICE_NAME="panel-naive-hy2"
INTERNAL_PORT=3000

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; PURPLE='\033[0;35m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'

log_step() { echo -e "\n${CYAN}${BOLD}> $1${RESET}"; }
log_ok()   { echo -e "${GREEN}  OK${RESET} $1"; }
log_warn() { echo -e "${YELLOW}  WARN${RESET} $1"; }
log_err()  { echo -e "${RED}  FAIL${RESET} $1"; }
log_info() { echo -e "     ${BLUE}$1${RESET}"; }

[[ $EUID -eq 0 ]] || { echo -e "${RED}Run as root: sudo bash vps_test_install.sh${RESET}"; exit 1; }

# ── OS / Arch / IP detection ─────────────────────────────────────────
command -v apt-get &>/dev/null || { log_err "Ubuntu/Debian only"; exit 1; }
OS_ID=$(grep -E '^ID=' /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '"')
log_info "OS: ${OS_ID:-unknown}"

MACHINE_ARCH="$(uname -m)"
case "$MACHINE_ARCH" in
  x86_64)  GO_ARCH="amd64";  HY_ARCH="amd64"  ;;
  aarch64) GO_ARCH="arm64";  HY_ARCH="arm64"  ;;
  armv7l)  GO_ARCH="armv6l"; HY_ARCH="arm"    ;;
  *)       GO_ARCH="amd64";  HY_ARCH="amd64"  ;;
esac
log_info "Arch: ${MACHINE_ARCH} (Go:${GO_ARCH} Hy2:${HY_ARCH})"

SERVER_IP=$(curl -4 -s --connect-timeout 8 ifconfig.me 2>/dev/null \
  || curl -4 -s --connect-timeout 8 icanhazip.com 2>/dev/null \
  || hostname -I | awk '{print $1}')
echo -e "     ${BLUE}IP: ${BOLD}${SERVER_IP}${RESET}"

# ── Mode detection: auto (env vars) vs interactive ────────────────────
[[ -n "${DOMAIN:-}" ]] && AUTO_MODE=1 || AUTO_MODE=0
TLS_MODE="${TLS_MODE:-}"
EMAIL="${EMAIL:-}"

# INTERACTIVE QUESTIONS (skipped if AUTO_MODE)

if [[ $AUTO_MODE -eq 1 ]]; then
  INSTALL_NAIVE=1; INSTALL_HY2=1
  USE_SQLITE="${USE_SQLITE:-false}"
  USE_NEW_FRONTEND="${USE_NEW_FRONTEND:-true}"
  PANEL_ACCESS="${PANEL_ACCESS:-nginx}"
  MASQUERADE_MODE="${MASQUERADE_MODE:-local}"
  MASQUERADE_URL="${MASQUERADE_URL:-}"
  NAIVE_USER="${NAIVE_USER:-$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 16)}"
  NAIVE_PASS="${NAIVE_PASS:-$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 24)}"
  HY2_PASS="${HY2_PASS:-$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 24)}"
  SSH_ONLY=0; LISTEN_HOST="0.0.0.0"; PANEL_DOMAIN=""
  case "$PANEL_ACCESS" in
    nginx)    ACCESS_MODE=1 ;;
    direct)   ACCESS_MODE=2 ;;
    ssh-only) ACCESS_MODE=2; SSH_ONLY=1; LISTEN_HOST="127.0.0.1" ;;
    *)        ACCESS_MODE=1 ;;
  esac
  [[ "$MASQUERADE_MODE" == "mirror" && -n "$MASQUERADE_URL" && ! "$MASQUERADE_URL" =~ ^https?:// ]] && \
    { log_warn "MASQUERADE_URL invalid, using default"; MASQUERADE_URL="https://www.iana.org"; }
  TLS_MODE="${TLS_MODE:-selfsigned}"
  EMAIL="${EMAIL:-}"
  log_info "Auto mode: ${DOMAIN} | TLS=${TLS_MODE} | SQLite=${USE_SQLITE} | React=${USE_NEW_FRONTEND} | Access=${PANEL_ACCESS}"
else
  # ── Interactive mode ─────────────────────────────────────────────────
  echo -e "\n${BOLD}Protocols:${RESET} ${CYAN}1)${RESET} Naive  ${CYAN}2)${RESET} Hysteria2  ${CYAN}3)${RESET} Both (rec)"
  read -rp "Choice [1/2/3]: " STACK_MODE; STACK_MODE="${STACK_MODE:-3}"
  case "$STACK_MODE" in 1) INSTALL_NAIVE=1; INSTALL_HY2=0;; 2) INSTALL_NAIVE=0; INSTALL_HY2=1;; *) INSTALL_NAIVE=1; INSTALL_HY2=1;; esac

  echo -e "\n${BOLD}Storage:${RESET} ${CYAN}1)${RESET} JSON (default)  ${CYAN}2)${RESET} SQLite"
  read -rp "Choice [1/2]: " STORAGE_MODE; STORAGE_MODE="${STORAGE_MODE:-1}"
  [[ "$STORAGE_MODE" == "2" ]] && USE_SQLITE=true || USE_SQLITE=false

  echo -e "\n${BOLD}React frontend:${RESET} ${CYAN}1)${RESET} Yes (default)  ${CYAN}2)${RESET} No"
  read -rp "Choice [1/2]: " _FRONT; [[ "${_FRONT:-1}" == "2" ]] && USE_NEW_FRONTEND=false || USE_NEW_FRONTEND=true

  echo -e "\n${BOLD}Panel access:${RESET} ${CYAN}1)${RESET} Nginx :8080  ${CYAN}2)${RESET} Direct :3000  ${CYAN}3)${RESET} SSH-only"
  read -rp "Choice [1/2/3]: " ACCESS_MODE; ACCESS_MODE="${ACCESS_MODE:-1}"
  SSH_ONLY=0; LISTEN_HOST="0.0.0.0"
  [[ "$ACCESS_MODE" == "3" ]] && { SSH_ONLY=1; LISTEN_HOST="127.0.0.1"; ACCESS_MODE=2; log_info "SSH-only: ssh -L 8080:127.0.0.1:${INTERNAL_PORT} root@${SERVER_IP}"; }

  echo -e "\n${BOLD}Masquerade:${RESET} ${CYAN}1)${RESET} Local page (default)  ${CYAN}2)${RESET} Mirror site"
  read -rp "Choice [1/2]: " _MASQ; MASQUERADE_MODE="local"; MASQUERADE_URL=""
  if [[ "${_MASQ:-1}" == "2" ]]; then
    read -rp "  URL: " MASQUERADE_URL
    [[ ! "$MASQUERADE_URL" =~ ^https?:// ]] && { log_warn "Bad URL, using iana.org"; MASQUERADE_URL="https://www.iana.org"; }
    MASQUERADE_MODE="mirror"
  fi

  # ── TLS mode ─────────────────────────────────────────────────────────
  echo -e "\n${BOLD}TLS:${RESET} ${CYAN}1)${RESET} Self-signed (default)  ${CYAN}2)${RESET} Let's Encrypt"
  read -rp "Choice [1/2]: " _TLSMODE
  TLS_MODE="selfsigned"; EMAIL=""
  if [[ "${_TLSMODE:-1}" == "2" ]]; then
    TLS_MODE="letsencrypt"
    read -rp "  Email for Let's Encrypt: " EMAIL
  fi

  read -rp $'\n'"${BOLD}Domain:${RESET} (A-record -> ${SERVER_IP}): " DOMAIN

  [[ $INSTALL_NAIVE -eq 1 ]] && NAIVE_USER=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 16) && NAIVE_PASS=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 24) || { NAIVE_USER=""; NAIVE_PASS=""; }
  [[ $INSTALL_HY2   -eq 1 ]] && HY2_PASS=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 24) || HY2_PASS=""

  echo -e "\n${GREEN}  Credentials:${RESET}"
  [[ $INSTALL_NAIVE -eq 1 ]] && log_info "NaiveProxy -> ${NAIVE_USER}:${NAIVE_PASS}"
  [[ $INSTALL_HY2   -eq 1 ]] && log_info "Hysteria2  -> pass: ${HY2_PASS}"
  read -rp "Start? [Enter / Ctrl+C]: " _
  echo ""
fi
[[ -z "${DOMAIN:-}" ]] && { log_err "DOMAIN is required"; exit 1; }

# Let's Encrypt validation
if [[ "$TLS_MODE" == "letsencrypt" ]]; then
  [[ -z "${EMAIL:-}" ]] && { log_err "EMAIL is required for Let's Encrypt mode"; exit 1; }
  [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && { log_err "DOMAIN must be a real FQDN (not IP) for Let's Encrypt"; exit 1; }
  [[ "$DOMAIN" != *"."* ]] && { log_err "DOMAIN must be a real FQDN for Let's Encrypt"; exit 1; }
fi

# ═══════ [1] System deps ──────────────────────────────────────────
log_step "[1] Installing dependencies..."
rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock 2>/dev/null || true
dpkg --configure -a >/dev/null 2>&1 || true
apt-get update -qq -o DPkg::Lock::Timeout=60 2>/dev/null || true
apt-get install -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" -o DPkg::Lock::Timeout=60 \
  curl wget git openssl build-essential libcap2-bin jq ca-certificates ufw 2>/dev/null || { log_err "Deps failed"; exit 1; }
log_ok "Dependencies installed"

# ═══════ [2] BBR + UDP tuning ══════════════════════════════════════
log_step "[2] BBR + UDP sysctl tuning..."
cat > /etc/sysctl.d/99-vps-test-tune.conf << 'SYSCTLEOF'
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.core.rmem_default=2500000
net.core.wmem_default=2500000
net.ipv4.tcp_fastopen=3
net.ipv6.conf.all.disable_ipv6=0
SYSCTLEOF
sysctl --system >/dev/null 2>&1 || true
log_ok "BBR + UDP optimizations applied"

# ═══════ [3] TLS certificate ═══════════════════════════════════════
if [[ "$TLS_MODE" == "letsencrypt" ]]; then
  log_step "[3] Let's Encrypt via Caddy ACME"
  log_info "Caddy will automatically obtain certificate at startup"
  log_info "Ensure port 80/tcp is open for HTTP-01 challenge"
else
  log_step "[3] Generating self-signed certificate..."
  mkdir -p /etc/ssl/selfsigned
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/ssl/selfsigned/server.key -out /etc/ssl/selfsigned/server.crt \
    -subj "/CN=${DOMAIN}" -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:127.0.0.1" 2>/dev/null || \
    { log_err "Cert generation failed"; exit 1; }
  chmod 644 /etc/ssl/selfsigned/server.crt; chmod 600 /etc/ssl/selfsigned/server.key
  log_ok "Self-signed cert for ${DOMAIN}"
fi

# ═══════ [4] Go + Caddy build (Vladisluv12 fork) ═══════════════════
if [[ $INSTALL_NAIVE -eq 1 ]]; then
  log_step "[4] Installing Go + building Caddy/Naive..."
  if [[ ! -f /usr/local/go/bin/go ]]; then
    GO_VERSION="go1.22.12"
    for _ in 1 2 3; do
      _v=$(curl -fsSL --connect-timeout 10 'https://go.dev/VERSION?m=text' 2>/dev/null | head -n1 | tr -d '[:space:]' || true)
      [[ -n "$_v" && "$_v" == go* ]] && { GO_VERSION="$_v"; break; }
      sleep 2
    done
    log_info "Downloading ${GO_VERSION}.linux-${GO_ARCH}..."
    curl -fsSL --connect-timeout 10 --max-time 300 "https://go.dev/dl/${GO_VERSION}.linux-${GO_ARCH}.tar.gz" -o /tmp/go.tar.gz || \
      { log_err "Go download failed"; exit 1; }
    tar -C /usr/local -xzf /tmp/go.tar.gz && rm -f /tmp/go.tar.gz
    grep -q "/usr/local/go/bin" /root/.profile 2>/dev/null || {
      echo 'export GOROOT=/usr/local/go' >> /root/.profile
      echo 'export GOPATH=/root/go' >> /root/.profile
      echo 'export PATH=$GOROOT/bin:$GOPATH/bin:$PATH' >> /root/.profile
    }
  fi
  export GOROOT=/usr/local/go GOPATH=/root/go PATH=/usr/local/go/bin:/root/go/bin:$PATH
  log_ok "Go: $(go version 2>/dev/null || echo ok)"

  log_step "Building Caddy + forwardproxy (3-7 min)..."
  export TMPDIR=/root/tmp GOPROXY=https://proxy.golang.org,direct
  mkdir -p /root/tmp /root/go
  go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest 2>&1 | tail -2
  [[ -f /root/go/bin/xcaddy ]] || { log_err "xcaddy failed"; exit 1; }
  cd /root && rm -rf /root/caddy-traffic /root/caddy
  git clone --depth 1 https://github.com/Vladisluv12/caddy_addon.git /root/caddy-traffic 2>/dev/null || \
    { log_err "Failed to clone forwardproxy-traffic repo"; exit 1; }
  /root/go/bin/xcaddy build --with github.com/caddyserver/forwardproxy=/root/caddy-traffic \
    2>&1 | while IFS= read -r l; do [[ -n "$l" ]] && echo "    $l"; done
  [[ -f /root/caddy ]] || { log_err "Caddy build failed"; exit 1; }
  mv /root/caddy /usr/local/bin/caddy-naive && chmod +x /usr/local/bin/caddy-naive
  setcap 'cap_net_bind_service=+ep' /usr/local/bin/caddy-naive 2>/dev/null || true
  log_ok "Caddy built: $(/usr/local/bin/caddy-naive version 2>/dev/null || echo ok)"
fi

# ═══════ [5] Hysteria2 download ═══════════════════════════════════
if [[ $INSTALL_HY2 -eq 1 ]]; then
  log_step "[5] Downloading Hysteria2..."
  HY_VERSION=$(curl -fsSL --connect-timeout 10 https://api.github.com/repos/apernet/hysteria/releases/latest 2>/dev/null | jq -r '.tag_name' 2>/dev/null || echo "")
  [[ -z "$HY_VERSION" || "$HY_VERSION" == "null" ]] && HY_VERSION="app/v2.5.2"
  log_info "Hysteria ${HY_VERSION} (linux-${HY_ARCH})..."
  rm -f /usr/local/bin/hysteria
  curl -fsSL --connect-timeout 10 --max-time 120 \
    "https://github.com/apernet/hysteria/releases/download/${HY_VERSION}/hysteria-linux-${HY_ARCH}" \
    -o /usr/local/bin/hysteria || {
      log_warn "Fallback to app/v2.5.2..."
      curl -fsSL --connect-timeout 10 --max-time 120 \
        "https://github.com/apernet/hysteria/releases/download/app/v2.5.2/hysteria-linux-${HY_ARCH}" \
        -o /usr/local/bin/hysteria || { log_err "Hysteria download failed"; exit 1; }
    }
  chmod +x /usr/local/bin/hysteria
  setcap 'cap_net_bind_service=+ep' /usr/local/bin/hysteria 2>/dev/null || true
  log_ok "Hysteria2: $(/usr/local/bin/hysteria version 2>&1 | head -n1 || echo ok)"
fi

# ═══════ [6] Camouflage page + proxy configs ══════════════════════
log_step "[6] Writing proxy configs..."
mkdir -p /var/www/naive /etc/naive /etc/hysteria
cat > /var/www/naive/index.html << 'HTMLEOF'
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading</title>
<style>body{background:#080808;height:100vh;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif}.bar{width:200px;height:3px;background:#151515;overflow:hidden;border-radius:2px;margin-bottom:25px}.fill{height:100%;width:40%;background:#fff;animation:slide 1.4s infinite ease-in-out}@keyframes slide{0%{transform:translateX(-100%)}50%{transform:translateX(50%)}100%{transform:translateX(200%)}}.t{color:#555;font-size:13px;letter-spacing:3px;font-weight:600}</style>
</head><body><div class="bar"><div class="fill"></div></div><div class="t">LOADING CONTENT</div></body></html>
HTMLEOF

if [[ $INSTALL_NAIVE -eq 1 ]]; then
  touch /etc/naive/traffic.json
  {
    printf '{\n  order forward_proxy before file_server\n  servers { protocols h1 h2 }\n}\n\n'
    printf ':8443, %s {\n' "${DOMAIN}"
    if [[ "$TLS_MODE" == "letsencrypt" ]]; then
      printf '    tls %s\n\n' "${EMAIL}"
    else
      printf '    tls /etc/ssl/selfsigned/server.crt /etc/ssl/selfsigned/server.key\n\n'
    fi
    printf '    forward_proxy {\n'
    printf '        basic_auth %s %s\n' "${NAIVE_USER}" "${NAIVE_PASS}"
    printf '        hide_ip\n        hide_via\n        probe_resistance\n'
    printf '        traffic_file /etc/naive/traffic.json\n    }\n\n'
    if [[ "$MASQUERADE_MODE" == "mirror" && -n "$MASQUERADE_URL" ]]; then
      printf '    reverse_proxy %s { header_up Host {upstream_hostport} }\n' "${MASQUERADE_URL}"
    else
      printf '    file_server { root /var/www/naive }\n'
    fi
    printf '}\n'
  } > /etc/naive/Caddyfile
  /usr/local/bin/caddy-naive validate --config /etc/naive/Caddyfile >/dev/null 2>&1 \
    && log_ok "Caddyfile valid" || log_warn "Caddyfile validation warning"
fi

if [[ $INSTALL_HY2 -eq 1 ]]; then
  # Base listen config
  cat > /etc/hysteria/config.yaml << HYEOF
listen: :8443

HYEOF

  # TLS section — self-signed or Let's Encrypt ACME
  if [[ "$TLS_MODE" == "letsencrypt" ]]; then
    cat >> /etc/hysteria/config.yaml << HYEOF
acme:
  domains:
    - ${DOMAIN}
  email: ${EMAIL}
  ca: letsencrypt
  listenHost: 0.0.0.0

HYEOF
  else
    cat >> /etc/hysteria/config.yaml << HYEOF
tls:
  cert: /etc/ssl/selfsigned/server.crt
  key: /etc/ssl/selfsigned/server.key

HYEOF
  fi

  # Auth section
  cat >> /etc/hysteria/config.yaml << HYEOF
auth:
  type: userpass
  userpass:
    default: "${HY2_PASS}"

HYEOF
  if [[ "$MASQUERADE_MODE" == "mirror" && -n "$MASQUERADE_URL" ]]; then
    printf 'masquerade:\n  type: proxy\n  proxy:\n    url: %s\n    rewriteHost: true\n\n' "${MASQUERADE_URL}" >> /etc/hysteria/config.yaml
  else
    printf 'masquerade:\n  type: file\n  file:\n    dir: /var/www/naive\n\n' >> /etc/hysteria/config.yaml
  fi
  cat >> /etc/hysteria/config.yaml << 'HYBWEOF'
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
HYBWEOF
  log_ok "Hysteria2 config written"
fi


# [7] Node.js 20 + PM2

log_step "[7] Installing Node.js 20 + PM2..."
if ! command -v node &>/dev/null || [[ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d 'v')" -lt 18 ]]; then
  if curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | tail -2; then
    apt-get install -y -qq nodejs -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" 2>/dev/null || true
  fi
  if ! command -v node &>/dev/null || [[ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d 'v')" -lt 18 ]]; then
    log_info "NodeSource failed, using nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash 2>&1 | tail -3 || true
    export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20 2>&1 | tail -3 || true; nvm alias default 20 2>/dev/null || true
  fi
fi
log_ok "Node.js: $(node -v 2>/dev/null || echo ok)"
npm install -g pm2 --silent 2>&1 | tail -2 || true
log_ok "PM2: $(pm2 -v 2>/dev/null || echo ok)"


# [8] Clone panel + install deps + build frontend

log_step "[8] Installing panel..."
if [[ -d "${PANEL_DIR}/.git" ]]; then
  cd "${PANEL_DIR}" && git fetch --all && git reset --hard "origin/${REPO_BRANCH}" 2>&1 | tail -2 || true
else
  rm -rf "${PANEL_DIR}"
  git clone -b "${REPO_BRANCH}" "${REPO_URL}" "${PANEL_DIR}" 2>&1 || { log_err "Clone failed"; exit 1; }
fi
cd "${PANEL_DIR}/panel"
npm install --omit=dev 2>&1 | grep -v "^npm warn" | tail -3 || true
mkdir -p "${PANEL_DIR}/panel/data"

if [[ "${USE_NEW_FRONTEND:-true}" == "true" ]]; then
  log_info "Building React frontend..."
  npm install 2>&1 | grep -v "^npm warn" | tail -5 || true
  NODE_ENV=production npm run build 2>&1 | tail -5 || {
    log_warn "Frontend build failed, falling back to legacy HTML"
    USE_NEW_FRONTEND=false
  }
  [[ -d "${PANEL_DIR}/panel/dist" ]] && log_ok "React frontend built -> dist/"
fi
log_ok "Panel installed"


# [9] Write panel config.json

log_step "[9] Writing panel config.json..."
CREATED="$(date -u +%FT%TZ)"
NAIVE_JSON="[]"; HY2_JSON="[]"
[[ $INSTALL_NAIVE -eq 1 ]] && NAIVE_JSON="[{\"username\":\"${NAIVE_USER}\",\"password\":\"${NAIVE_PASS}\",\"createdAt\":\"${CREATED}\"}]"
[[ $INSTALL_HY2   -eq 1 ]] && HY2_JSON="[{\"username\":\"default\",\"password\":\"${HY2_PASS}\",\"createdAt\":\"${CREATED}\"}]"
[[ $INSTALL_NAIVE -eq 1 ]] && STACK_NAIVE="true" || STACK_NAIVE="false"
[[ $INSTALL_HY2   -eq 1 ]] && STACK_HY2="true"   || STACK_HY2="false"

cat > "${PANEL_DIR}/panel/data/config.json" << CONFIGEOF
{
  "installed": true,
  "stack": { "naive": ${STACK_NAIVE}, "hy2": ${STACK_HY2} },
  "domain": "${DOMAIN}",
  "email": "${EMAIL:-}",
  "tlsMode": "${TLS_MODE:-selfsigned}",
  "panelDomain": "${PANEL_DOMAIN:-}",
  "panelEmail":  "",
  "accessMode":  "${ACCESS_MODE:-1}",
  "sshOnly":     ${SSH_ONLY:-0},
  "listenHost":  "${LISTEN_HOST:-0.0.0.0}",
  "masqueradeMode": "${MASQUERADE_MODE:-local}",
  "masqueradeUrl":  "${MASQUERADE_URL:-}",
  "serverIp": "${SERVER_IP}",
  "arch": "${MACHINE_ARCH}",
  "port": 8443,
  "adminPassword": "",
  "naiveUsers": ${NAIVE_JSON},
  "hy2Users":   ${HY2_JSON}
}
CONFIGEOF
log_ok "config.json written"


# [10] Nginx reverse proxy (if PANEL_ACCESS=nginx)

NGINX_OK=0
if [[ "${ACCESS_MODE:-1}" == "1" && "$SSH_ONLY" != "1" ]]; then
  log_step "[10] Setting up Nginx (8080 -> ${INTERNAL_PORT})..."
  apt-get update -qq 2>&1 | tail -2 || true
  command -v nginx >/dev/null 2>&1 || apt-get install -y nginx -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" 2>&1 | tail -5
  if command -v nginx >/dev/null 2>&1; then
    mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
    cat > /etc/nginx/sites-available/panel-naive-hy2 << NGXEOF
server {
    listen 8080;
    server_name _;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    location / {
        proxy_pass http://127.0.0.1:${INTERNAL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
NGXEOF
    ln -sf /etc/nginx/sites-available/panel-naive-hy2 /etc/nginx/sites-enabled/panel-naive-hy2 2>/dev/null || true
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    if nginx -t 2>&1 | grep -q "successful"; then
      systemctl restart nginx 2>/dev/null || true
      systemctl enable nginx >/dev/null 2>&1 || true
      NGINX_OK=1; log_ok "Nginx: 8080 -> ${INTERNAL_PORT}"
    else
      log_warn "Nginx config invalid, panel on direct :${INTERNAL_PORT}"
    fi
  fi
fi


# [11] Start panel via PM2

log_step "[11] Starting panel (PM2)..."
cd "${PANEL_DIR}/panel"
pm2 delete "${SERVICE_NAME}" 2>/dev/null || true; sleep 1
LISTEN_HOST="${LISTEN_HOST:-0.0.0.0}" USE_SQLITE="${USE_SQLITE:-false}" USE_NEW_FRONTEND="${USE_NEW_FRONTEND:-true}" \
  pm2 start server/index.js --name "${SERVICE_NAME}" --time --restart-delay=3000 --update-env 2>&1 | tail -3
pm2 save --force >/dev/null 2>&1 || true
eval "$(pm2 startup systemd -u root --hp /root 2>/dev/null | grep "^sudo")" 2>/dev/null || true
sleep 2

if pm2 describe "${SERVICE_NAME}" 2>/dev/null | grep -q online; then
  log_ok "Panel online (PM2)"
else
  log_warn "PM2 failed, trying systemd fallback..."
  cat > /etc/systemd/system/panel-naive-hy2.service << SVCBEOF
[Unit]
Description=Panel Naive + Hy2 (fallback)
After=network.target
[Service]
Type=simple
WorkingDirectory=${PANEL_DIR}/panel
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${INTERNAL_PORT}
Environment=LISTEN_HOST=${LISTEN_HOST:-0.0.0.0}
Environment=USE_SQLITE=${USE_SQLITE:-false}
Environment=USE_NEW_FRONTEND=${USE_NEW_FRONTEND:-true}
StandardOutput=journal
StandardError=journal
[Install]
WantedBy=multi-user.target
SVCBEOF
  systemctl daemon-reload
  systemctl enable panel-naive-hy2 >/dev/null 2>&1 || true
  systemctl restart panel-naive-hy2 2>&1 || true
  sleep 2
  systemctl is-active --quiet panel-naive-hy2 && log_ok "Panel online (systemd)" || log_err "Panel failed"
fi


# [12] Systemd services: naive.service + hysteria.service

log_step "[12] Creating systemd services..."
if [[ $INSTALL_NAIVE -eq 1 ]]; then
  systemctl stop naive 2>/dev/null || true
  cat > /etc/systemd/system/naive.service << 'SVCEOF'
[Unit]
Description=NaiveProxy (Caddy + forwardproxy)
After=network.target network-online.target
Requires=network-online.target
[Service]
Type=notify
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
  log_ok "naive.service created"
fi

if [[ $INSTALL_HY2 -eq 1 ]]; then
  systemctl stop hysteria 2>/dev/null || true
  cat > /etc/systemd/system/hysteria.service << 'HYSVCEOF'
[Unit]
Description=Hysteria2 Server
After=network.target network-online.target naive.service
Wants=naive.service
Requires=network-online.target
StartLimitIntervalSec=60s
StartLimitBurst=3
[Service]
Type=simple
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
  log_ok "hysteria.service created"
fi
systemctl daemon-reload


# [13] UFW firewall

log_step "[13] Configuring UFW..."
ufw allow 22/tcp   >/dev/null 2>&1 || true
ufw allow 8443/tcp >/dev/null 2>&1 || true
ufw allow 8443/udp >/dev/null 2>&1 || true
# Let's Encrypt HTTP-01 ACME challenge
if [[ "$TLS_MODE" == "letsencrypt" ]]; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
fi
if [[ "$SSH_ONLY" == "1" ]]; then
  ufw deny 8080/tcp >/dev/null 2>&1 || true
  ufw deny ${INTERNAL_PORT}/tcp >/dev/null 2>&1 || true
elif [[ "${ACCESS_MODE:-1}" == "1" && $NGINX_OK -eq 1 ]]; then
  ufw allow 8080/tcp >/dev/null 2>&1 || true
  ufw deny ${INTERNAL_PORT}/tcp >/dev/null 2>&1 || true
else
  ufw allow ${INTERNAL_PORT}/tcp >/dev/null 2>&1 || true
fi
echo "y" | ufw enable >/dev/null 2>&1 || ufw --force enable >/dev/null 2>&1 || true
log_ok "UFW configured"


# [14] Start proxy services

log_step "[14] Starting proxy services..."
if [[ $INSTALL_NAIVE -eq 1 ]]; then
  systemctl enable --now naive 2>&1 || log_warn "naive start failed"
  for i in $(seq 1 20); do
    systemctl is-active --quiet naive 2>/dev/null && { log_ok "naive running (${i}s)"; break; }
    sleep 1; [[ $i -eq 20 ]] && log_warn "naive slow: journalctl -u naive"
  done
fi
if [[ $INSTALL_HY2 -eq 1 ]]; then
  systemctl enable --now hysteria 2>&1 || log_warn "hysteria start failed"
  for i in $(seq 1 15); do
    systemctl is-active --quiet hysteria 2>/dev/null && { log_ok "hysteria running (${i}s)"; break; }
    sleep 1; [[ $i -eq 15 ]] && log_warn "hysteria slow: journalctl -u hysteria"
  done
fi


# [15] Smoke tests

echo ""
echo -e "${CYAN}${BOLD}> Smoke test${RESET}"
_SF=0; _SW=0

[[ $INSTALL_NAIVE -eq 1 && -f /etc/naive/Caddyfile ]] && {
  /usr/local/bin/caddy-naive validate --config /etc/naive/Caddyfile >/dev/null 2>&1 \
    && log_ok "Caddyfile valid" || { log_err "Caddyfile invalid"; _SF=$((_SF+1)); }
}

for svc in naive hysteria; do
  [[ $svc == "naive" && $INSTALL_NAIVE -eq 0 ]] && continue
  [[ $svc == "hysteria" && $INSTALL_HY2 -eq 0 ]] && continue
  systemctl is-active --quiet "$svc" 2>/dev/null \
    && log_ok "${svc}.service active" || { log_err "${svc}.service NOT active"; _SF=$((_SF+1)); }
done

sleep 1
curl -fsS --max-time 5 "http://127.0.0.1:${INTERNAL_PORT}/" >/dev/null 2>&1 \
  && log_ok "Panel responds on :${INTERNAL_PORT}" \
  || { log_warn "Panel not responding on :${INTERNAL_PORT}"; _SW=$((_SW+1)); }

[[ $INSTALL_NAIVE -eq 1 ]] && {
  curl -fsSk --max-time 8 -o /dev/null "https://127.0.0.1:8443/" 2>/dev/null \
    && log_ok "HTTPS :8443 responds (${TLS_MODE:-selfsigned})" \
    || { log_warn "HTTPS :8443 not responding"; _SW=$((_SW+1)); }
}

if [[ $_SF -eq 0 && $_SW -eq 0 ]]; then log_ok "Smoke test: all passed"
elif [[ $_SF -eq 0 ]]; then log_warn "Smoke test: ${_SW} warning(s)"
else log_err "Smoke test: ${_SF} error(s), ${_SW} warning(s)"
fi


# Insecure flag for client links
if [[ "$TLS_MODE" == "letsencrypt" ]]; then
  _INSECURE=0; _INSECURE_JSON="false"
else
  _INSECURE=1; _INSECURE_JSON="true"
fi

# SUMMARY

echo ""
echo -e "${PURPLE}${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${PURPLE}${BOLD}║   INSTALLATION COMPLETE                                      ║${RESET}"
echo -e "${PURPLE}${BOLD}║   TLS mode: ${TLS_MODE:-selfsigned}                                         ║${RESET}"
echo -e "${PURPLE}${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}"
echo -e "${PURPLE}${BOLD}║   PANEL:                                                     ║${RESET}"
if [[ "$SSH_ONLY" == "1" ]]; then
  echo -e "${PURPLE}${BOLD}║   ssh -L 8080:127.0.0.1:${INTERNAL_PORT} root@${SERVER_IP}${RESET}"
  echo -e "${PURPLE}${BOLD}║   http://localhost:8080 (admin/admin)                        ║${RESET}"
elif [[ "${ACCESS_MODE:-1}" == "1" && $NGINX_OK -eq 1 ]]; then
  echo -e "${PURPLE}${BOLD}║   http://${SERVER_IP}:8080 (admin/admin)                     ║${RESET}"
else
  echo -e "${PURPLE}${BOLD}║   http://${SERVER_IP}:${INTERNAL_PORT} (admin/admin)${RESET}"
fi
echo -e "${PURPLE}${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}"
if [[ $INSTALL_NAIVE -eq 1 ]]; then
  echo -e "${CYAN}   NaiveProxy:  naive+https://${NAIVE_USER}:${NAIVE_PASS}@${DOMAIN}:8443${RESET}"
  echo -e "${PURPLE}${BOLD}║   User: ${NAIVE_USER}                                         ║${RESET}"
  echo -e "${PURPLE}${BOLD}║   Pass: ${NAIVE_PASS}${RESET}"
fi
if [[ $INSTALL_HY2 -eq 1 ]]; then
  echo -e "${CYAN}   Hysteria2:   hysteria2://default:${HY2_PASS}@${DOMAIN}:8443?sni=${DOMAIN}&insecure=${_INSECURE}#VPS-Test${RESET}"
  echo -e "${PURPLE}${BOLD}║   Pass: ${HY2_PASS}${RESET}"
fi
echo -e "${PURPLE}${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}"
[[ $INSTALL_NAIVE -eq 1 ]] && echo -e "   Sing-box naive: {\"type\":\"naive\",\"server\":\"${DOMAIN}\",\"server_port\":8443,\"username\":\"${NAIVE_USER}\",\"password\":\"${NAIVE_PASS}\",\"tls\":{\"enabled\":true,\"insecure\":${_INSECURE_JSON},\"server_name\":\"${DOMAIN}\"}}"
[[ $INSTALL_HY2   -eq 1 ]] && echo -e "   Sing-box hy2:   {\"type\":\"hysteria2\",\"server\":\"${DOMAIN}\",\"server_port\":8443,\"password\":\"${HY2_PASS}\",\"tls\":{\"enabled\":true,\"insecure\":${_INSECURE_JSON},\"server_name\":\"${DOMAIN}\"}}"
echo -e "${PURPLE}${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Traffic: /etc/naive/traffic.json + http://${SERVER_IP}:9999 (Hy2 stats)"
echo ""

exit 0
