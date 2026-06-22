#!/usr/bin/env bash
set -euo pipefail

CONF="/etc/sysctl.d/99-panel-tuning.conf"

cat > "$CONF" << 'EOF'
# RIXXX Panel — network tuning for proxy servers

# BBR congestion control
net.ipv4.tcp_congestion_control = bbr
net.core.default_qdisc = fq

# UDP buffers (for Hysteria2 / QUIC)
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.core.rmem_default = 1048576
net.core.wmem_default = 1048576

# TCP Fast Open (3 = client + server)
net.ipv4.tcp_fastopen = 3

# conntrack limit
net.netfilter.nf_conntrack_max = 262144
EOF

sysctl -w net.ipv4.tcp_congestion_control=bbr >/dev/null 2>&1
sysctl -w net.core.default_qdisc=fq >/dev/null 2>&1
sysctl -w net.core.rmem_max=16777216 >/dev/null 2>&1
sysctl -w net.core.wmem_max=16777216 >/dev/null 2>&1
sysctl -w net.core.rmem_default=1048576 >/dev/null 2>&1
sysctl -w net.core.wmem_default=1048576 >/dev/null 2>&1
sysctl -w net.ipv4.tcp_fastopen=3 >/dev/null 2>&1
sysctl -w net.netfilter.nf_conntrack_max=262144 >/dev/null 2>&1 || true

echo "Applied. Current values:"
echo "  bbr:            $(sysctl -n net.ipv4.tcp_congestion_control)"
echo "  qdisc:          $(sysctl -n net.core.default_qdisc)"
echo "  rmem_max:       $(sysctl -n net.core.rmem_max)"
echo "  wmem_max:       $(sysctl -n net.core.wmem_max)"
echo "  tcp_fastopen:   $(sysctl -n net.ipv4.tcp_fastopen)"
echo "  conntrack_max:  $(sysctl -n net.netfilter.nf_conntrack_max 2>/dev/null || echo 'N/A')"
