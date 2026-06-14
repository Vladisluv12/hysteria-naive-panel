#!/bin/sh
# Hysteria2 entrypoint — always seed config to shared volume
set -e

SEED_FILE="/seed/hysteria-config.yaml"
TARGET_FILE="/etc/hysteria/config.yaml"

mkdir -p "$(dirname "$TARGET_FILE")"
cp "$SEED_FILE" "$TARGET_FILE"

echo "Starting Hysteria2 server..."
exec /usr/local/bin/hysteria server --config "$TARGET_FILE"
