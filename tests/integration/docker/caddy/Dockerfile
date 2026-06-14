FROM caddy:builder AS builder
ARG TARGETARCH=amd64
RUN xcaddy build --with github.com/caddyserver/forwardproxy@caddy2

FROM caddy:latest
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /seed/Caddyfile
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
