# Integration tests for Panel Naive + Hysteria2

## Context

Проект: веб-панель для управления NaiveProxy (Caddy) и Hysteria2 на VPS.
Сейчас есть vitest unit-тесты (panel/tests/security.test.js) и bats shell-тесты (tests/install.bats).

Нужна система интеграционных тестов, которая:
1. Поднимает реальные серверные сервисы (Caddy/Naive, Hysteria2, Panel API) в Docker
2. Создаёт нескольких клиентов через sing-box как subprocess
3. Проверяет TCP (Naive) и UDP (Hysteria2) подключения через тестовый HTTP сервер

**Выборы принятые на brainstorming:**
- Язык: Python + pytest
- Уровень: полный сценарий (панель + транспорт)
- Naive сервер: Caddy c `tls internal`
- Инфраструктура: Docker Compose для серверов, sing-box клиенты как subprocess
- Цель проверки: свой тестовый HTTP сервер в Docker
- Верификация: TCP и UDP

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Docker Compose                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ test-srv │  │ caddy    │  │ hysteria2│  │ panel       │ │
│  │ nginx    │  │ :10443   │  │ :10444/ud│  │ Express     │ │
│  │ :1080    │  │ tls int. │  │ self-crt │  │ :3000       │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
│       │              │              │               │        │
│       └──────────────┴──────────────┴───────────────┘        │
│                         bridge network                        │
└──────────────────────────────┬────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │      Host OS         │
                    │  :10443 :10444 :3000 │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │     pytest          │
                    │  + sing-box client  │
                    │  subprocess         │
                    │  SOCKS5 :10801+     │
                    └─────────────────────┘
```

## Services

### docker-compose.yml

```yaml
services:
  test-server:
    image: nginx:alpine
    volumes:
      - ./test-server/:/usr/share/nginx/html:ro
    networks:
      - testnet

  certs:
    image: alpine:3
    volumes:
      - ./certs/:/certs:rw
    command: >
      sh -c "apk add openssl &&
             openssl req -x509 -nodes -days 365 -newkey rsa:2048
               -keyout /certs/server.key -out /certs/server.pem
               -subj '/CN=test.localhost' -addext 'subjectAltName=DNS:test.localhost,IP:127.0.0.1'"

  caddy-naive:
    image: caddy:latest
    depends_on: [certs]
    ports: ["10443:10443"]
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./certs/:/certs:ro
    networks:
      - testnet

  hysteria2:
    build: ./hysteria2
    depends_on: [certs]
    ports: ["10444:10444/udp"]
    volumes:
      - ./hysteria2/config.yaml:/etc/hysteria/config.yaml:ro
      - ./certs/:/certs:ro
    networks:
      - testnet

  panel:
    build: ./panel
    ports: ["3000:3000"]
    environment:
      NODE_ENV: test
      PORT: 3000
      TEST_MODE: "1"
    volumes:
      - ./panel/data/:/app/data
    networks:
      - testnet

networks:
  testnet:
    driver: bridge
```

### Caddy (NaiveProxy)

**Caddyfile:**
```
:10443, test.localhost {
    tls internal

    forward_proxy {
        basic_auth {{USER}} {{PASS}}
        hide_ip
        hide_via
        probe_resistance
    }

    file_server {
        root /var/www/html
    }
}
```

`tls internal` генерирует самоподписанный сертификат для `test.localhost`.
Порт 10443 (непривилегированный, без конфликта с реальными сервисами).

### Hysteria2

**config.yaml:**
```yaml
listen: :10444
tls:
  cert: /certs/server.pem
  key: /certs/server.key
auth:
  type: userpass
  userpass:
    testuser: testpass
masquerade:
  type: file
  file:
    dir: /var/www/html
```

Самоподписанный сертификат, сгенерированный сервисом `certs`.
Пароль пользователя будет обновляться через панель API во время теста.

### Panel (Express)

Dockerfile:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY ../../panel/package*.json ./
RUN npm install --omit=dev
COPY ../../panel/ .
ENV NODE_ENV=test
EXPOSE 3000
CMD ["node", "server/index.js"]
```

В режиме `NODE_ENV=test` (или `TEST_MODE=1`) panel:
- Использует `/app/data/` для config.json и users.json (вместо системных путей)
- При операциях writeCaddyfile/writeHysteriaConfig пишет во временные файлы (или логирует), не трогает /etc/

### Test Server

Простой nginx:alpine с фиксированным ответом:
```json
// /usr/share/nginx/html/health
{"status":"ok","ts":"REPLACED_AT_RUNTIME"}
```

## Test Architecture (Python)

### Directory structure

```
tests/integration/
├── docker/
│   ├── docker-compose.yml
│   ├── caddy/
│   │   └── Caddyfile
│   ├── hysteria2/
│   │   ├── Dockerfile
│   │   └── config.yaml
│   ├── panel/
│   │   └── Dockerfile
│   ├── test-server/
│   │   └── index.html
│   └── certs/
│       └── generate.sh
├── conftest.py
├── helpers/
│   ├── __init__.py
│   ├── panel_client.py
│   ├── singbox_client.py
│   └── checkers.py
└── tests/
    ├── __init__.py
    ├── test_naive_connectivity.py
    ├── test_hysteria2_connectivity.py
    ├── test_multiple_clients.py
    └── test_user_lifecycle.py
```

### Key Classes

**`SingBoxClient` (`helpers/singbox_client.py`)**:

```python
class SingBoxClient:
    """Manages a sing-box client subprocess for testing proxy connectivity."""

    def __init__(self, config: dict, socks_port: int, temp_dir: str):
        # Builds the full sing-box config.json:
        # {
        #   "log": {"level": "error"},
        #   "inbounds": [{
        #       "type": "socks",
        #       "tag": "socks-in",
        #       "listen": "127.0.0.1",
        #       "listen_port": socks_port,
        #       "sniff": true
        #   }],
        #   "outbounds": [
        #       config,           # naive or hysteria2 outbound
        #       {"type": "direct", "tag": "direct"}
        #   ],
        #   "route": {
        #       "rules": [{"outbound": "proxy", "inbound": ["socks-in"]}]
        #   }
        # }

    def start(self):
        # Writes config to temp_dir/config.json
        # Popen(["sing-box", "run", "-c", str(self.config_path)])

    def stop(self):
        # process.terminate(); wait(); cleanup temp dir

    def check_tcp(self, target_url: str) -> bool:
        # curl -x socks5h://127.0.0.1:{port} {target_url}

    def check_udp(self, dns_server: str, domain: str) -> bool:
        # Python socket via SOCKS5 → UDP DNS query
```

**`PanelClient` (`helpers/panel_client.py`)**:

```python
class PanelClient:
    """HTTP client for the panel API."""

    def __init__(self, base_url: str):
        # base_url = "http://127.0.0.1:3000"

    def login(self) -> str:
        # POST /api/login, returns session cookie + CSRF token

    def create_naive_user(self, username: str, password: str, expire_days: int = 0) -> dict:
        # POST /api/naive/users

    def create_hy2_user(self, username: str, password: str, expire_days: int = 0) -> dict:
        # POST /api/hy2/users

    def delete_naive_user(self, username: str):
        # DELETE /api/naive/users/{username}

    def delete_hy2_user(self, username: str):
        # DELETE /api/hy2/users/{username}
```

### pytest Fixtures (conftest.py)

```python
@pytest.fixture(scope="session")
def docker_services():
    """Start docker-compose, wait for health, yield, tear down."""

@pytest.fixture
def panel_api(docker_services):
    """Logged-in PanelClient instance."""

@pytest.fixture
def test_server_url(docker_services):
    """http://test-server:1080/health"""

@pytest.fixture
def singbox():
    """Factory fixture: returns a function that creates SingBoxClient instances."""
```

## Test Cases

### 1. Naive Proxy connectivity (TCP)

1. Через panel API создать Naive-пользователя
2. Запустить Caddy с обновлённым Caddyfile (или panel делает это через writeCaddyfile)
3. Запустить sing-box naive client (SOCKS5 на :10801)
4. Проверить TCP: `check_tcp("http://test-server/health")` → 200 OK
5. Остановить клиента
6. Удалить пользователя через API

### 2. Hysteria2 connectivity (TCP + UDP)

1. Через panel API создать Hysteria2-пользователя
2. Перезапустить hysteria-server с обновлённым userpass
3. Запустить sing-box hysteria2 client (SOCKS5 на :10802)
4. Проверить TCP: `check_tcp("http://test-server/health")` → 200 OK
5. Проверить UDP: через SOCKS5 отправить DNS-запрос, проверить ответ
6. Остановить клиента
7. Удалить пользователя через API

### 3. Multiple clients (параллельные подключения)

1. Создать N пользователей (N=3)
2. Запустить N sing-box клиентов на разных SOCKS портах
3. Одновременно проверить TCP-соединение через каждого
4. Остановить всех клиентов
5. Удалить всех пользователей

### 4. User lifecycle (expiry)

1. Создать пользователя с expire_days=0 (бессрочно) — подключение работает
2. Продлить/изменить срок через API
3. Создать пользователя с коротким сроком (1 мин для теста)
4. Дождаться истечения
5. Проверить что подключение больше не работает
6. Продлить ключ — подключение восстанавливается

## Requirements

### System Dependencies for Test Runner

- Python 3.10+
- `pip install -r tests/integration/requirements.txt`:
  - pytest
  - requests
  - docker-py (optional, for Docker API healthchecks)
  - PySocks (for UDP testing via SOCKS5)
- Docker + Docker Compose (v2)
- sing-box binary in PATH (for client subprocesses)

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_PROJECT_DIR` | `../../` | Path to project root |
| `TEST_DOCKER_COMPOSE` | `./docker/docker-compose.yml` | Compose file path |
| `TEST_PANEL_URL` | `http://127.0.0.1:3000` | Panel base URL |
| `TEST_SING_BOX_BIN` | `sing-box` | Path to sing-box binary |
| `TEST_CADDY_NAIVE_PORT` | `10443` | Caddy Naive port |
| `TEST_HY2_PORT` | `10444` | Hysteria2 port |
| `TEST_SERVER_URL` | `http://test-server/health` | Test HTTP server URL (Docker DNS, resolve через прокси) |
| `TEST_LOG_LEVEL` | `INFO` | Log level |

## Verification Strategy

### TCP verification

```python
def _check_tcp(self, timeout=10) -> bool:
    """HTTP GET через SOCKS5 прокси, проверка статуса и тела."""
    try:
        resp = requests.get(
            self.target_url,
            proxies={"http": f"socks5h://127.0.0.1:{self.socks_port}",
                     "https": f"socks5h://127.0.0.1:{self.socks_port}"},
            timeout=timeout
        )
        return resp.status_code == 200
    except (requests.RequestException, ConnectionError):
        return False
```

### UDP verification

```python
def _check_udp(self, timeout=10) -> bool:
    """DNS query через SOCKS5 UDP."""
    import socks
    s = socks.socksocket()
    s.set_proxy(socks.SOCKS5, "127.0.0.1", self.socks_port, udp=True)
    s.settimeout(timeout)
    try:
        s.sendto(b"\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00"
                 b"\x03www\x07example\x03com\x00\x00\x01\x00\x01",
                 ("8.8.8.8", 53))
        data, _ = s.recvfrom(512)
        return len(data) > 0
    except (socket.timeout, OSError):
        return False
    finally:
        s.close()
```

## Panel Integration (Shared Config Flow)

Для полного сценария (панель → сервисы → клиент) используется **shared config volume**:

```yaml
services:
  caddy-naive:
    volumes:
      - config-share:/etc/caddy:rw    # panel пишет Caddyfile сюда

  hysteria2:
    volumes:
      - config-share:/etc/hysteria:rw  # panel пишет config.yaml сюда

  panel:
    environment:
      TEST_MODE: "1"
      TEST_CONFIG_DIR: /config-share
    volumes:
      - config-share:/config-share:rw

volumes:
  config-share:
```

**Модификация panel/server/index.js для TEST_MODE:**
- `TEST_CONFIG_DIR=/config-share` переопределяет:
  - `writeCaddyfile()` → `${TEST_CONFIG_DIR}/Caddyfile`
  - `writeHysteriaConfig()` → `${TEST_CONFIG_DIR}/config.yaml`
- `systemctl` команды → `docker exec <container>` или логируются
- Это single seam — одно минимальное изменение без влияния на production код

**Caddy reload в тестовом режиме:**
После записи Caddyfile panel выполняет `caddy reload` или, в тестовом режиме, через `docker exec caddy-naive caddy reload --config /etc/caddy/Caddyfile` (если HOSTNAME переменная задана).

**Hysteria restart:**
Аналогично — `docker exec hysteria2 kill -HUP 1` или `docker restart hysteria2`. В тестовом режиме это даёт обратную связь о том, что конфиг валидный.

**Без этой интеграции тесты проверяют только изолированно:**
- Panel API → CRUD корректны
- Transport → протокол работает с pre-configured юзером

**С интеграцией:**
- Panel создаёт юзера → пишет конфиг → Caddy/Hy2 перечитывают → sing-box подключается → работает
- Удаление юзера → конфиг чистится → подключение перестаёт работать

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Docker не установлен | `skipif`/`mark.docker` в pytest; тесты пропускаются с сообщением |
| Нет sing-box в PATH | Аналогичный маркер + fallback сообщение |
| Порты заняты | Фикстура выбирает случайные свободные порты |
| Caddy tls internal не стартует без DNS | Используем `/etc/hosts` entry в контейнере или IP-based |
| Hysteria2 self-signed cert не принимается | sing-box client `tls.insecure: true` |
| Медленный старт Docker | `docker compose up -d` + healthcheck-wait (до 60s timeout) |
| Shared volume race condition | `docker compose exec` синхронные вызовы reload/restart |
