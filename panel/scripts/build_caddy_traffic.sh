#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
#  Build Caddy + forwardproxy-traffic (per-user traffic counters)
#  Panel Naive + Hysteria2 by RIXXX
#
#  Собирает Caddy с кастомным модулем forwardproxy,
#  который считает RX/TX трафик по каждому пользователю
#  и пишет статистику в /etc/rixxx-panel/naive_users.json
#
#  Использование:
#    sudo bash build_caddy_traffic.sh                                    # из ~/projects/forwardproxy-traffic
#    sudo bash build_caddy_traffic.sh /path/to/forwardproxy-traffic      # из папки
#    sudo bash build_caddy_traffic.sh https://github.com/user/repo       # из GitHub
# ═══════════════════════════════════════════════════════════════════════

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive

RED='\033[0;31m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; RESET='\033[0m'

log()      { echo -e "${CYAN}▶${RESET} $1"; }
log_ok()   { echo -e "${GREEN}✅${RESET} $1"; }
log_err()  { echo -e "${RED}❌${RESET} $1"; }
log_info() { echo -e "   $1"; }

# ── Аргументы ─────────────────────────────────────────────────────────
MODULE_SRC="${1:-}"
LOCAL_DIR="${HOME}/projects/forwardproxy-traffic"
REMOTE_URL=""

if [[ -n "$MODULE_SRC" ]]; then
  if [[ -d "$MODULE_SRC" ]]; then
    LOCAL_DIR="$MODULE_SRC"
  else
    REMOTE_URL="$MODULE_SRC"
  fi
fi

# ── Root check ────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  log_err "Запускайте от root: sudo bash build_caddy_traffic.sh"
  exit 1
fi

# ── Определяем архитектуру ───────────────────────────────────────────
case "$(uname -m)" in
  x86_64)  GO_ARCH="amd64"  ;;
  aarch64) GO_ARCH="arm64"  ;;
  armv7l)  GO_ARCH="armv6l" ;;
  *)       GO_ARCH="amd64"  ;;
esac
log_info "Arch: $(uname -m) → Go:${GO_ARCH}"

# ── Проверка Go ──────────────────────────────────────────────────────
if [[ ! -f /usr/local/go/bin/go ]] && ! command -v go &>/dev/null; then
  log "Установка Go..."
  rm -rf /usr/local/go
  GO_VERSION=""
  for _ in 1 2 3; do
    GO_VERSION=$(curl -fsSL --connect-timeout 10 'https://go.dev/VERSION?m=text' 2>/dev/null | head -n1 | tr -d '[:space:]' || true)
    [[ -n "$GO_VERSION" && "$GO_VERSION" == go* ]] && break
    sleep 2
  done
  [[ -z "$GO_VERSION" || "$GO_VERSION" != go* ]] && GO_VERSION="go1.22.5"

  log_info "Загружаем ${GO_VERSION}.linux-${GO_ARCH}..."
  wget -q --timeout=180 \
    "https://go.dev/dl/${GO_VERSION}.linux-${GO_ARCH}.tar.gz" \
    -O /tmp/go.tar.gz

  if [[ ! -s /tmp/go.tar.gz ]]; then
    log_err "Не удалось загрузить Go"
    exit 1
  fi

  tar -C /usr/local -xzf /tmp/go.tar.gz
  rm -f /tmp/go.tar.gz

  grep -q "/usr/local/go/bin" /root/.profile 2>/dev/null || {
    echo 'export PATH=$PATH:/usr/local/go/bin:/root/go/bin' >> /root/.profile
    echo 'export GOPATH=/root/go' >> /root/.profile
  }
fi

export GOPATH=/root/go
export GOROOT=/usr/local/go
export PATH=$GOROOT/bin:$GOPATH/bin:$PATH
export TMPDIR=/root/tmp
export GOPROXY=https://proxy.golang.org,direct
mkdir -p /root/tmp /root/go

GO_VER=$(go version 2>/dev/null || echo "unknown")
log_ok "Go: $GO_VER"

# ── Подготовка модуля ────────────────────────────────────────────────
BUILD_DIR="/root/forwardproxy-traffic-build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

if [[ -n "$LOCAL_DIR" && -d "$LOCAL_DIR" ]]; then
  log "Используем локальный модуль: $LOCAL_DIR"
  cp -r "$LOCAL_DIR"/* "$BUILD_DIR/"
elif [[ -n "${REMOTE_URL:-}" ]]; then
  # Пользователь передал свой remote URL — клонируем напрямую (готовый модуль)
  log "Клонируем модуль: $REMOTE_URL"
  git clone --depth=1 "$REMOTE_URL" "$BUILD_DIR" 2>/dev/null || {
    log_err "Не удалось клонировать $REMOTE_URL"
    exit 1
  }
  # Проверяем что это наш модуль (с traffic.go)
  if [[ ! -f "$BUILD_DIR/traffic.go" ]]; then
    log_err "В репозитории $REMOTE_URL нет traffic.go — это не forwardproxy-traffic модуль"
    log_err "Убедитесь, что пушите модуль из ~/projects/forwardproxy-traffic"
    exit 1
  fi
else
  log_err "Не указан источник модуля"
  log_err "Использование:"
  log_err "  sudo bash build_caddy_traffic.sh                         # из ~/projects/forwardproxy-traffic"
  log_err "  sudo bash build_caddy_traffic.sh /path/to/module          # из локальной папки"
  log_err "  sudo bash build_caddy_traffic.sh https://github.com/u/r   # из GitHub remote"
  exit 1
fi

if [[ ! -f "$BUILD_DIR/traffic.go" ]]; then
  log_err "traffic.go не найден в $BUILD_DIR — модуль неполный"
  exit 1
fi
log_ok "Модуль готов: $BUILD_DIR"

# ── Установка xcaddy ─────────────────────────────────────────────────
log "Установка xcaddy..."
go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest 2>&1 | tail -3

if [[ ! -f /root/go/bin/xcaddy ]]; then
  log_err "xcaddy не установился"
  exit 1
fi

# ── Сборка Caddy ─────────────────────────────────────────────────────
log "Сборка Caddy + forwardproxy-traffic (займёт 3-7 минут)..."
cd /root || exit
rm -f /root/caddy

/root/go/bin/xcaddy build \
  --with github.com/caddyserver/forwardproxy="$BUILD_DIR" \
  2>&1 | while IFS= read -r line; do
    echo "  $line"
  done

if [[ ! -f /root/caddy ]]; then
  log_err "Caddy не собран! Проверьте логи выше."
  exit 1
fi

# Проверяем что forward_proxy модуль присутствует в сборке
if ! /root/caddy list-modules 2>/dev/null | grep -q "http.handlers.forward_proxy"; then
  log_err "forward_proxy модуль не найден в собранном Caddy!"
  exit 1
fi

CADDY_VER=$(/root/caddy version 2>/dev/null || echo "unknown")
log_ok "Caddy собран: $CADDY_VER"

# ── Резервная копия + установка ──────────────────────────────────────
if [[ -f /usr/bin/caddy ]]; then
  BACKUP="/usr/bin/caddy.bak.$(date +%Y%m%d_%H%M%S)"
  cp /usr/bin/caddy "$BACKUP"
  log_info "Резервная копия: $BACKUP"
fi

mv /root/caddy /usr/bin/caddy
chmod +x /usr/bin/caddy
setcap 'cap_net_bind_service=+ep' /usr/bin/caddy 2>/dev/null || true

# ── Обновление Caddyfile (добавляем traffic_file) ────────────────────
CADDYFILE="/etc/caddy/Caddyfile"
if [[ -f "$CADDYFILE" ]]; then
  if ! grep -q "traffic_file" "$CADDYFILE"; then
    log_info "Добавляем traffic_file в Caddyfile..."
    if grep -q "probe_resistance" "$CADDYFILE"; then
      indent=$(grep 'probe_resistance' "$CADDYFILE" | sed 's/\(^[[:space:]]*\).*/\1/')
      sed -i "/probe_resistance/a\\${indent}traffic_file /etc/rixxx-panel/naive_users.json" "$CADDYFILE"
    fi
    if ! grep -q "traffic_file" "$CADDYFILE"; then
      # fallback: вставляем перед закрывающей скобкой forward_proxy блока
      sed -i '/forward_proxy {/,/^[[:space:]]*}/ {
        /^[[:space:]]*}/i\    traffic_file /etc/rixxx-panel/naive_users.json
      }' "$CADDYFILE"
    fi
    if /usr/bin/caddy validate --config "$CADDYFILE" 2>&1; then
      log_ok "Caddyfile обновлён и валиден"
    else
      log_info "Предупреждение валидации (игнорируем)"
    fi
  else
    log_info "traffic_file уже есть в Caddyfile"
  fi
fi

# ── Создаём директорию для JSON ──────────────────────────────────────
mkdir -p /etc/rixxx-panel

# ── Перезапуск Caddy ─────────────────────────────────────────────────
log "Перезапуск Caddy..."
if systemctl is-active --quiet caddy 2>/dev/null; then
  systemctl restart caddy 2>&1 || {
    log_info "systemctl restart fail, пробуем reload..."
    /usr/bin/caddy reload --config "$CADDYFILE" --force 2>&1 || true
  }
else
  systemctl start caddy 2>&1 || {
    log_info "systemctl start fail, fallback в nohup..."
    pkill -f "caddy run" 2>/dev/null || true
    sleep 1
    nohup /usr/bin/caddy run --config "$CADDYFILE" > /var/log/caddy.log 2>&1 &
  }
fi

sleep 2

# ── Проверка ─────────────────────────────────────────────────────────
if systemctl is-active --quiet caddy 2>/dev/null; then
  log_ok "Caddy запущен (systemd)"
elif pgrep -x caddy >/dev/null 2>/dev/null; then
  log_ok "Caddy запущен (процесс)"
else
  log_err "Caddy не запустился! Проверьте: journalctl -u caddy -n 30"
  exit 1
fi

# ── Проверяем что файл статистики создаётся ─────────────────────────
log "Ожидание первого flush статистики (до 10с)..."
for i in $(seq 1 10); do
  if [[ -f /etc/rixxx-panel/naive_users.json ]]; then
    log_ok "Статистика пишется: $(wc -c < /etc/rixxx-panel/naive_users.json) байт"
    break
  fi
  sleep 1
  if [[ $i -eq 10 ]]; then
    log_info "Файл статистики ещё не создан (появится после подключения клиента)"
  fi
done

log ""
log "╔══════════════════════════════════════════════════════════════╗"
log "║   ✅ Caddy + forwardproxy-traffic собран и запущен!         ║"
log "║   Статистика: /etc/rixxx-panel/naive_users.json"
log "║   Резервная копия: ${BACKUP:-нет}"
log "║   Версия: $CADDY_VER"
log "╚══════════════════════════════════════════════════════════════╝"
log ""

exit 0
