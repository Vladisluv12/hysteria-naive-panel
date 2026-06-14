#!/bin/bash
# tests/integration/setup.sh - Install dependencies for integration tests
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${SCRIPT_DIR}"

# Python venv
if [ ! -d venv ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt

# sing-box binary
if [ ! -f bin/sing-box ]; then
    mkdir -p bin
    SING_VER="1.13.0"
    echo "Downloading sing-box v${SING_VER}..."
    curl -fsSL "https://github.com/SagerNet/sing-box/releases/download/v${SING_VER}/sing-box-${SING_VER}-linux-amd64.tar.gz" \
        | tar -xz -C /tmp/
    cp "/tmp/sing-box-${SING_VER}-linux-amd64/sing-box" bin/
    chmod +x bin/sing-box
    rm -rf "/tmp/sing-box-${SING_VER}-linux-amd64"
    echo "sing-box installed: $(bin/sing-box version)"
fi

echo "Setup complete!"
