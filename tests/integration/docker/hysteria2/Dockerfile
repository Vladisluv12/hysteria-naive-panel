FROM alpine:3

ARG HY2_TAG=app/v2.9.2
ARG TARGETARCH=amd64

RUN apk add --no-cache wget ca-certificates && \
    wget -qO /usr/local/bin/hysteria \
      "https://github.com/apernet/hysteria/releases/download/${HY2_TAG}/hysteria-linux-${TARGETARCH}" && \
    chmod +x /usr/local/bin/hysteria && \
    hysteria version

COPY config.yaml /seed/hysteria-config.yaml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 10444/udp
CMD ["/entrypoint.sh"]
