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

# ══════════════════════════════════════════════════════
step 1
log "▶ Installing WireGuard + wgcf..."
# ══════════════════════════════════════════════════════

apt-get update -qq 2>/dev/null || true
apt-get install -y -qq wireguard-tools jq curl 2>/dev/null || true

# Download wgcf
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
log "  wgcf: $(/usr/local/bin/wgcf version 2>&1 | head -1)"

# ══════════════════════════════════════════════════════
step 2
log "▶ Registering with Cloudflare WARP..."
# ══════════════════════════════════════════════════════

WGCF_DIR="/etc/wireguard"
mkdir -p "$WGCF_DIR"

# Register if no account exists
if [[ ! -f /etc/wgcf-profile.json ]]; then
  /usr/local/bin/wgcf register --accept-tos 2>&1 | tail -3
fi

if [[ ! -f /etc/wgcf-profile.json ]]; then
  log "ERROR: wgcf registration failed"
  exit 1
fi

log "  Account ID: $(jq -r '.accountID' /etc/wgcf-profile.json 2>/dev/null || echo unknown)"

# ══════════════════════════════════════════════════════
step 3
log "▶ Generating WireGuard config..."
# ══════════════════════════════════════════════════════

/usr/local/bin/wgcf generate 2>&1 | tail -3

if [[ -f /etc/wireguard/wgcf-profile.conf ]]; then
  mv /etc/wireguard/wgcf-profile.conf /etc/wireguard/warp.conf
  log "  Config: /etc/wireguard/warp.conf"
else
  log "ERROR: wgcf config not generated"
  exit 1
fi

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

# Write final config — NO AllowedIPs 0.0.0.0/0, routing handled by ip rules
cat > "$WARP_CONF" << WGEOF
[Interface]
PrivateKey = ${PRIVATE_KEY}
Address = ${WARP_ADDR}/32
DNS = 1.1.1.1
MTU = 1280

PostUp = /etc/wireguard/warp-route-up.sh
PostDown = /etc/wireguard/warp-route-down.sh

[Peer]
PublicKey = ${PEER_PUBKEY}
Endpoint = ${PEER_ENDPOINT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
WGEOF

log "  Config written: $WARP_CONF"

# ══════════════════════════════════════════════════════
step 5
log "▶ Creating routing scripts + IP detection list..."
# ══════════════════════════════════════════════════════

# IPs used for IP detection — only these go through WARP
cat > /etc/wireguard/warp-ipdetect.txt << 'IPDEOF'
# IP detection services — traffic to these goes through WARP
# Format: one CIDR or IP per line

# icanhazip.com / curl ifconfig.me
104.16.132.229
104.16.133.229
172.64.139.179
172.64.140.34
2606:4700::1111
2606:4700::1001

# ipinfo.io
34.117.59.0/24
2606:4700:10::/48

# ip-api.com
108.61.164.0/24
2a04:4e42::/48

# Google IP check
216.58.214.206
142.250.74.110
2a00:1450:4001:829::200e
IPDEOF

# PostUp: routing table + ip rules for IP detection IPs
cat > /etc/wireguard/warp-route-up.sh << 'UPSCRIPT'
#!/bin/bash
set -e

WARP_TABLE=100
WARP_PRIO=100

ip route flush table $WARP_TABLE 2>/dev/null || true
ip route add default dev warp0 table $WARP_TABLE

while IFS= read -r line; do
  line=$(echo "$line" | sed 's/#.*//' | xargs)
  [[ -z "$line" ]] && continue
  ip rule add to "$line" lookup $WARP_TABLE priority $WARP_PRIO 2>/dev/null || true
done < /etc/wireguard/warp-ipdetect.txt

echo "WARP routing configured"
UPSCRIPT
chmod +x /etc/wireguard/warp-route-up.sh

# PostDown: cleanup
cat > /etc/wireguard/warp-route-down.sh << 'DNSCRIPT'
#!/bin/bash
set -e

WARP_TABLE=100

while IFS= read -r line; do
  line=$(echo "$line" | sed 's/#.*//' | xargs)
  [[ -z "$line" ]] && continue
  ip rule del to "$line" lookup $WARP_TABLE 2>/dev/null || true
done < /etc/wireguard/warp-ipdetect.txt

ip route flush table $WARP_TABLE 2>/dev/null || true
echo "WARP routing removed"
DNSCRIPT
chmod +x /etc/wireguard/warp-route-down.sh

log "  IP list: /etc/wireguard/warp-ipdetect.txt"

# ══════════════════════════════════════════════════════
step 6
log "▶ Creating systemd service..."
# ══════════════════════════════════════════════════════

cat > /etc/systemd/system/warp.service << 'SVCEOF'
[Unit]
Description=Cloudflare WARP (wgcf)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/wg-quick up warp
ExecStop=/usr/bin/wg-quick down warp
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable warp 2>/dev/null || true

log "  warp.service created"

# ══════════════════════════════════════════════════════
step 7
log "▶ Starting WARP tunnel..."
# ══════════════════════════════════════════════════════

systemctl start warp 2>&1 || log "WARN: warp start failed"
sleep 2

if systemctl is-active --quiet warp 2>/dev/null; then
  log "  WARP: active"
  WARP_IP=$(curl -s --interface warp0 --max-time 5 https://ipinfo.io/ip 2>/dev/null || echo "")
  if [[ -n "$WARP_IP" ]]; then
    log "  WARP IP: $WARP_IP"
  fi
else
  log "  WARP: failed to start, check: journalctl -u warp -n 20"
fi

# ══════════════════════════════════════════════════════
log "✅ WARP setup complete"
log ""
log "  Config:  /etc/wireguard/warp.conf"
log "  IPs:     /etc/wireguard/warp-ipdetect.txt"
log "  Service: systemctl start/stop/restart warp"
log ""

exit 0
