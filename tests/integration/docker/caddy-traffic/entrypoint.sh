#!/bin/sh
set -e

mkdir -p /etc/caddy /tmp
cp /seed/Caddyfile /etc/caddy/Caddyfile

exec caddy run --config /etc/caddy/Caddyfile
