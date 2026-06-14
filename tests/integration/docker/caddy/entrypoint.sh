#!/bin/sh
# Caddy entrypoint — always seed config to shared volume
set -e

SEED_FILE="/seed/Caddyfile"
TARGET_FILE="/etc/caddy/Caddyfile"

mkdir -p "$(dirname "$TARGET_FILE")"
cp "$SEED_FILE" "$TARGET_FILE"

exec caddy run --config "$TARGET_FILE"
