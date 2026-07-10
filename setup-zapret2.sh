#!/bin/bash
# setup-zapret2.sh — Установка и настройка zapret2 (nfqws2) на VPS сервере
# Для обхода DPI на стороне сервера (server mode)
#
# Использование:
#   sudo bash setup-zapret2.sh          # установка + настройка
#   sudo bash setup-zapret2.sh --test   # только тест (проверка工作)
#   sudo bash setup-zapret2.sh --remove # удаление
#
# Требования: Ubuntu/Debian, root/sudo, подключение к интернету

set -euo pipefail

# --- Конфигурация ---
ZAPRET_DIR="/opt/zapret2"
NFQ_QUEUE=200
# Порты отдельных протоколов (переопределяются через env, напр. из vps_test_install.sh)
NAIVE_HY2_PORT="${NAIVE_HY2_PORT:-8443}"   # naive (TCP) + hysteria2 (TCP+UDP), общий порт
MIERU_PORT="${MIERU_PORT:-9443}"           # mieru (TCP, без TLS ClientHello)
VLESS_PORT="${VLESS_PORT:-10443}"          # VLESS+XHTTP+REALITY (TCP, TLS-like)
# Порты прокси-сервисов (TCP) — для nftables NFQUEUE-перехвата
TCP_PORTS="${NAIVE_HY2_PORT},${MIERU_PORT},${VLESS_PORT}"
# Порты прокси-сервисов (UDP) — hysteria2/QUIC
UDP_PORTS="${NAIVE_HY2_PORT}"
# Порты с TLS ClientHello/ServerHello (naive + hy2 + vless-reality)
TLS_PORTS="${NAIVE_HY2_PORT},${VLESS_PORT}"
# Макс. пакетов для обработки на соединение
TCP_PACKET_LIMIT=12
UDP_PACKET_LIMIT=10

# --- Цвета ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
fail()  { error "$*"; exit 1; }

# --- Проверка окружения ---
check_env() {
    [[ $EUID -eq 0 ]] || fail "Запустите от root: sudo bash $0"
    command -v apt >/dev/null || fail "Требуется apt (Ubuntu/Debian)"
    command -v nft >/dev/null || fail "Требуется nftables"
}

# --- Установка ---
install_deps() {
    info "Установка зависимостей..."
    apt update -qq
    apt install -y -qq \
        git build-essential \
        libnetfilter-queue-dev libnfnetlink-dev libmnl-dev \
        liblua5.4-dev luajit libluajit-5.1-dev \
        libcap-dev zlib1g-dev \
        tcpdump 2>&1 | tail -3
}

install_zapret() {
    if [[ -d "$ZAPRET_DIR/.git" ]]; then
        info "zapret2 уже установлен в $ZAPRET_DIR"
        return 0
    fi

    info "Клонирование zapret2..."
    git clone --depth 1 https://github.com/bol-van/zapret2.git "$ZAPRET_DIR"

    info "Сборка nfqws2..."
    cd "$ZAPRET_DIR"
    make 2>&1 | tail -5

    info "Установка бинарников..."
    ./install_bin.sh 2>&1 | tail -3

    info "zapret2 установлен: $($ZAPRET_DIR/nfq2/nfqws2 --version 2>&1 | head -1)"
}

# --- Конфигурация nfqws2 ---
create_nfqws_config() {
    info "Создание конфигурации nfqws2..."

    cat > "$ZAPRET_DIR/nfqws-server.sh" << SCRIPT
#!/bin/bash
# nfqws2 server mode — DPI bypass для прокси-серверов
# Автогенерировано setup-zapret2.sh (TLS_PORTS=${TLS_PORTS} UDP_PORTS=${UDP_PORTS} MIERU_PORT=${MIERU_PORT})

exec /opt/zapret2/nfq2/nfqws2 \\
    --qnum=200 \\
    --server \\
    --lua-init=@/opt/zapret2/lua/zapret-lib.lua \\
    --lua-init=@/opt/zapret2/lua/zapret-antidpi.lua \\
    \\
    --in-range=a --out-range=a \\
    \\
    --filter-tcp=${TLS_PORTS} --filter-l7=tls \\
    --payload=tls_client_hello \\
    --lua-desync=fake:blob=fake_default_tls:tcp_md5:tls_mod=rnd,rndsni,dupsid \\
    --lua-desync=multisplit:pos=1:seqovl=5:seqovl_pattern=0x1603030000 \\
    --new \\
    \\
    --filter-tcp=${TLS_PORTS} --filter-l7=tls \\
    --payload=tls_server_hello \\
    --lua-desync=pktmod:tcp_md5 \\
    --lua-desync=wssize:wsize=65535 \\
    --new \\
    \\
    --filter-udp=${UDP_PORTS} --filter-l7=quic \\
    --payload=quic_initial \\
    --lua-desync=fake:blob=fake_default_quic:repeats=2 \\
    --new \\
    \\
    --filter-tcp=${MIERU_PORT} --out-range=-n10 \\
    --lua-desync=pktmod:tcp_md5 \\
    --lua-desync=wssize:wsize=65535 \\
    --new
SCRIPT
    chmod +x "$ZAPRET_DIR/nfqws-server.sh"
}

# --- nftables правила ---
create_nftables_rules() {
    info "Создание nftables правил..."

    cat > /tmp/zapret2.nft << NFT
table inet zapret {
    chain predefrag {
        type filter hook prerouting priority -401; policy accept;
        meta mark & 0x40000000 != 0x00000000 notrack
    }

    chain incoming {
        type filter hook input priority -101; policy accept;
        meta mark & 0x40000000 == 0 meta l4proto tcp \\
            tcp dport { ${TCP_PORTS} } \\
            ct original packets 1-${TCP_PACKET_LIMIT} \\
            counter queue num ${NFQ_QUEUE} bypass
        meta mark & 0x40000000 == 0 meta l4proto udp \\
            udp dport { ${UDP_PORTS} } \\
            ct original packets 1-${UDP_PACKET_LIMIT} \\
            counter queue num ${NFQ_QUEUE} bypass
    }

    chain outgoing {
        type filter hook output priority 101; policy accept;
        meta mark & 0x40000000 == 0 meta l4proto tcp \\
            tcp sport { ${TCP_PORTS} } \\
            ct original packets 1-${TCP_PACKET_LIMIT} \\
            counter queue num ${NFQ_QUEUE} bypass
        meta mark & 0x40000000 == 0 meta l4proto udp \\
            udp sport { ${UDP_PORTS} } \\
            ct original packets 1-${UDP_PACKET_LIMIT} \\
            counter queue num ${NFQ_QUEUE} bypass
    }
}
NFT
    info "Правила созданы в /tmp/zapret2.nft"
}

# --- systemd сервис ---
create_systemd_service() {
    info "Создание systemd сервиса..."

    cat > /etc/systemd/system/zapret2.service << 'UNIT'
[Unit]
Description=zapret2 DPI bypass (nfqws2)
After=network.target
Wants=network.target

[Service]
Type=simple
ExecStartPre=/usr/sbin/nft -f /tmp/zapret2.nft
ExecStart=/opt/zapret2/nfqws-server.sh
ExecStopPost=-/usr/sbin/nft delete table inet zapret
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT

    systemctl daemon-reload
    info "Сервис создан: systemctl {start|stop|status} zapret2"
}

# --- Тест ---
run_test() {
    info "=== Тест zapret2 ==="

    # 1. Проверяем nfqws2
    if ! pgrep -f nfqws2 >/dev/null 2>&1; then
        warn "nfqws2 не запущен. Запускаю..."
        systemctl start zapret2 2>/dev/null || {
            # Ручной запуск для теста
            nft -f /tmp/zapret2.nft 2>/dev/null
            $ZAPRET_DIR/nfqws-server.sh &>/tmp/nfqws2-test.log &
            sleep 2
        }
    fi

    # 2. Проверяем nftables
    if nft list table inet zapret >/dev/null 2>&1; then
        info "nftables правила: OK"
    else
        error "nftables правила не найдены"
        return 1
    fi

    # 3. Генерируем трафик и проверяем счётчики
    info "Генерация тестового трафика..."
    for port in ${TCP_PORTS//,/ }; do
        curl -sk "https://localhost:${port}" >/dev/null 2>&1 || true
    done
    sleep 1

    local incoming outgoing
    incoming=$(nft list chain inet zapret incoming 2>/dev/null | grep -o 'packets [0-9]*' | head -1 | awk '{print $2}')
    outgoing=$(nft list chain inet zapret outgoing 2>/dev/null | grep -o 'packets [0-9]*' | head -1 | awk '{print $2}')

    if [[ "${incoming:-0}" -gt 0 ]] || [[ "${outgoing:-0}" -gt 0 ]]; then
        info "Пакеты обрабатываются: incoming=${incoming:-0}, outgoing=${outgoing:-0}"
    else
        warn "Счётчики пустые — nfqws2 может не получать пакеты из NFQUEUE"
    fi

    # 4. Проверяем что прокси-сервисы работают
    info "Проверка прокси-сервисов..."
    local all_ok=true
    for svc in xray hysteria naive mita; do
        if systemctl is-active "$svc" >/dev/null 2>&1; then
            info "  $svc: active"
        else
            warn "  $svc: inactive"
            all_ok=false
        fi
    done

    # 5. Проверяемnfqws2 debug log (если есть)
    if [[ -f /tmp/nfqws2-test.log ]]; then
        local fakes splits
        fakes=$(grep -c 'fake.*desync' /tmp/nfqws2-test.log 2>/dev/null || echo 0)
        splits=$(grep -c 'multisplit.*desync' /tmp/nfqws2-test.log 2>/dev/null || echo 0)
        info "Debug: fake=$fakes, multisplit=$splits"
    fi

    echo
    info "=== Тест завершён ==="
    if $all_ok; then
        info "Всё работает. nfqws2 обрабатывает пакеты через NFQUEUE."
    else
        warn "Есть проблемы — проверьте статус сервисов."
    fi
}

# --- Удаление ---
remove_zapret() {
    info "Удаление zapret2..."

    systemctl stop zapret2 2>/dev/null || true
    systemctl disable zapret2 2>/dev/null || true
    rm -f /etc/systemd/system/zapret2.service
    systemctl daemon-reload

    nft delete table inet zapret 2>/dev/null || true
    rm -f /tmp/zapret2.nft

    if [[ -d "$ZAPRET_DIR" ]]; then
        rm -rf "$ZAPRET_DIR"
        info "zapret2 удалён из $ZAPRET_DIR"
    fi

    info "Удаление завершено."
}

# --- main ---
main() {
    case "${1:-}" in
        --test)
            check_env
            run_test
            ;;
        --remove)
            check_env
            remove_zapret
            ;;
        --help|-h)
            echo "Использование: sudo bash $0 [--test|--remove]"
            echo "  (без аргументов) — установка и настройка"
            echo "  --test            — проверка工作"
            echo "  --remove          — удаление"
            exit 0
            ;;
        *)
            check_env
            install_deps
            install_zapret
            create_nfqws_config
            create_nftables_rules
            create_systemd_service

            info "Запуск zapret2..."
            systemctl enable zapret2
            systemctl start zapret2
            sleep 2

            run_test
            ;;
    esac
}

main "$@"
