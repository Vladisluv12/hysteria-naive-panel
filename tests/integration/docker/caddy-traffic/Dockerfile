FROM caddy:builder AS builder
ARG TARGETARCH=amd64

RUN xcaddy build --with github.com/caddyserver/forwardproxy=github.com/Vladisluv12/caddy_addon

FROM caddy:latest
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY tests/integration/docker/caddy-traffic/Caddyfile /seed/Caddyfile
COPY tests/integration/docker/caddy-traffic/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
