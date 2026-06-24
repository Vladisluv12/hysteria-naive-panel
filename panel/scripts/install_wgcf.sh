#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Cloudflare WARP via wgcf — by RIXXX
#  Panel Naive + Hysteria2 by RIXXX
#  ENV: USE_WARP (0/1)
# ═══════════════════════════════════════════════════════

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

USE_WARP="${USE_WARP:-0}"

if [[ "$USE_WARP" != "1" ]]; then
  echo "WARP disabled, skipping"
  exit 0
fi

log()  { echo "$1"; }
step() { echo "STEP:$1"; }

WGCF_DIR="/etc/wireguard"
WGCF_WORKDIR="/tmp/wgcf-work"
mkdir -p "$WGCF_DIR" "$WGCF_WORKDIR"

# ══════════════════════════════════════════════════════
step 1
log "▶ Installing WireGuard + wgcf..."
# ══════════════════════════════════════════════════════

apt-get update -qq 2>/dev/null || true
apt-get install -y -qq wireguard-tools jq curl 2>/dev/null || true

WGCF_VERSION="2.2.22"
WGCF_ARCH="$(uname -m)"
case "$WGCF_ARCH" in
  x86_64)  WGCF_PLATFORM="linux_amd64" ;;
  aarch64) WGCF_PLATFORM="linux_arm64" ;;
  armv7l)  WGCF_PLATFORM="linux_armv7" ;;
  *)       WGCF_PLATFORM="linux_amd64" ;;
esac

if [[ ! -f /usr/local/bin/wgcf ]]; then
  log "  Downloading wgcf ${WGCF_VERSION} (${WGCF_PLATFORM})..."
  curl -fsSL --connect-timeout 10 --max-time 60 \
    "https://github.com/ViRb3/wgcf/releases/download/v${WGCF_VERSION}/wgcf_${WGCF_VERSION}_${WGCF_PLATFORM}" \
    -o /usr/local/bin/wgcf || { log "ERROR: wgcf download failed"; exit 1; }
  chmod +x /usr/local/bin/wgcf
fi
log "  wgcf: installed"

# ══════════════════════════════════════════════════════
step 2
log "▶ Registering with Cloudflare WARP..."
# ══════════════════════════════════════════════════════

if [[ ! -f "$WGCF_WORKDIR/wgcf-account.toml" ]]; then
  cd "$WGCF_WORKDIR"
  /usr/local/bin/wgcf register --accept-tos 2>&1 | tail -3
fi

if [[ ! -f "$WGCF_WORKDIR/wgcf-account.toml" ]]; then
  log "ERROR: wgcf registration failed"
  exit 1
fi
log "  Account registered"

# ══════════════════════════════════════════════════════
step 3
log "▶ Generating WireGuard config..."
# ══════════════════════════════════════════════════════

cd "$WGCF_WORKDIR"
/usr/local/bin/wgcf generate 2>&1 | tail -3

if [[ -f "$WGCF_WORKDIR/wgcf-profile.conf" ]]; then
  mv "$WGCF_WORKDIR/wgcf-profile.conf" "$WGCF_DIR/warp.conf"
elif [[ -f "$WGCF_WORKDIR/warp.conf" ]]; then
  mv "$WGCF_WORKDIR/warp.conf" "$WGCF_DIR/warp.conf"
else
  log "ERROR: wgcf config not generated"
  exit 1
fi
log "  Config: $WGCF_DIR/warp.conf"

# ══════════════════════════════════════════════════════
step 4
log "▶ Configuring WireGuard interface..."
# ══════════════════════════════════════════════════════

WARP_CONF="/etc/wireguard/warp.conf"

# Read keys from generated config
PRIVATE_KEY=$(grep 'PrivateKey' "$WARP_CONF" | head -1 | awk '{print $3}')
WARP_ADDR=$(grep 'Address' "$WARP_CONF" | head -1 | awk '{print $3}' | cut -d'/' -f1)
PEER_PUBKEY=$(grep 'PublicKey' "$WARP_CONF" | tail -1 | awk '{print $3}')
PEER_ENDPOINT=$(grep 'Endpoint' "$WARP_CONF" | head -1 | awk '{print $3}')

# Build AllowedIPs — resolve default domains + include known CIDRs
DEFAULT_IPS=""
for domain in icanhazip.com ipinfo.io ip-api.com checkip.amazonaws.com google.com googleapis.com gstatic.com googleusercontent.com ggpht.com; do
  ips=$(dig +short A "$domain" 2>/dev/null | grep -E '^[0-9]' | sed 's|$|/32|' | tr '\n' ',' | sed 's/,$//')
  [[ -n "$ips" ]] && DEFAULT_IPS="${DEFAULT_IPS}${ips},"
done
DEFAULT_IPS="${DEFAULT_IPS}104.16.132.229/32, 104.16.133.229/32, 172.64.139.179/32, 172.64.140.34/32, 34.117.59.0/24, 108.61.164.0/24"
ALLOWED_IPS=$(echo "$DEFAULT_IPS" | sed 's/,\s*$//' | sed 's/,/, /g')

cat > "$WARP_CONF" << WGEOF
[Interface]
PrivateKey = ${PRIVATE_KEY}
Address = ${WARP_ADDR}/32
MTU = 1280

[Peer]
PublicKey = ${PEER_PUBKEY}
Endpoint = ${PEER_ENDPOINT}
AllowedIPs = ${ALLOWED_IPS}
PersistentKeepalive = 25
WGEOF

log "  Config written: $WARP_CONF"

# ══════════════════════════════════════════════════════
step 5
log "▶ Creating systemd service..."
# ══════════════════════════════════════════════════════

cat > /etc/systemd/system/warp.service << 'SVCEOF'
[Unit]
Description=Cloudflare WARP (wgcf)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/wg-quick up warp
ExecStop=/usr/bin/wg-quick down warp

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable warp 2>/dev/null || true
log "  warp.service created"

# ══════════════════════════════════════════════════════
step 6
log "▶ Starting WARP tunnel..."
# ══════════════════════════════════════════════════════

systemctl start warp 2>&1 || log "WARN: warp start failed"
sleep 3

if systemctl is-active --quiet warp 2>/dev/null; then
  log "  WARP: active"
  WARP_IP=$(curl -s --interface warp --max-time 5 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -o 'warp=on' || echo "")
  if [[ -n "$WARP_IP" ]]; then
    log "  WARP: confirmed (warp=on)"
  fi
else
  log "  WARP: failed to start, check: journalctl -u warp -n 20"
fi

# ══════════════════════════════════════════════════════
log "✅ WARP setup complete"
log ""
log "  Config:  /etc/wireguard/warp.conf"
log "  Service: systemctl start/stop/restart warp"
log ""

exit 0
