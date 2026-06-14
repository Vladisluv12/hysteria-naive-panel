# Integration Tests Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Docker-based integration test system for Panel Naive + Hysteria2 using pytest and sing-box

**Architecture:** Docker Compose runs Caddy/Naive, Hysteria2, Panel API, and test HTTP server. Python pytest (in venv) orchestrates tests and manages sing-box client subprocesses. Tests verify TCP (Naive) and UDP (Hysteria2) proxy connectivity end-to-end.

**Tech Stack:** Python 3 + pytest + requests + PySocks, Docker Compose, sing-box (client), Caddy (server), Hysteria2 (server)

---

## File Structure

### New files to create:

```
tests/integration/
├── docker/
│   ├── docker-compose.yml
│   ├── caddy/
│   │   └── Caddyfile
│   ├── hysteria2/
│   │   ├── Dockerfile
│   │   ├── config.yaml
│   │   └── entrypoint.sh
│   ├── panel/
│   │   └── Dockerfile
│   ├── test-server/
│   │   └── index.html
│   └── certs/
│       └── generate.sh
├── helpers/
│   ├── __init__.py
│   ├── singbox_client.py
│   ├── panel_client.py
│   └── checkers.py
├── tests/
│   ├── __init__.py
│   ├── test_naive_connectivity.py
│   ├── test_hysteria2_connectivity.py
│   ├── test_multiple_clients.py
│   └── test_user_lifecycle.py
├── conftest.py
└── requirements.txt
```

### Existing files to modify:

- `panel/server/index.js` — add TEST_MODE config path override (seam)
- `.gitignore` — add `tests/integration/venv/` if not present

---

### Task 1: Setup dependencies (pip venv + sing-box binary)

**Files:**
- Create: `tests/integration/requirements.txt`
- Other: system packages

- [ ] **Step 1: Create Python venv + install dependencies**

```bash
cd tests/integration
python3 -m venv venv
source venv/bin/activate
```

- [ ] **Step 2: Create requirements.txt**

```
pytest>=8.0
requests>=2.31
PySocks>=1.7
```

```bash
pip install -r requirements.txt
```

- [ ] **Step 3: Download sing-box binary to project-local bin**

```bash
mkdir -p tests/integration/bin
# Latest stable from https://github.com/SagerNet/sing-box/releases
SING_VER="1.13.0"
curl -fsSL "https://github.com/SagerNet/sing-box/releases/download/v${SING_VER}/sing-box-${SING_VER}-linux-amd64.tar.gz" \
  | tar -xz -C /tmp/
cp "/tmp/sing-box-${SING_VER}-linux-amd64/sing-box" tests/integration/bin/
chmod +x tests/integration/bin/sing-box
tests/integration/bin/sing-box version
```

Expected: `sing-box version 1.13.0`

---

### Task 2: Panel TEST_MODE seam

**Files:**
- Modify: `panel/server/index.js`
- Create: `tests/integration/docker/panel/Dockerfile`

- [ ] **Step 1: Add TEST_MODE env var support to server/index.js**

Добавить в начало файла (после констант PORT/LISTEN_HOST):

```javascript
// ── TEST_MODE override (integration tests) ──────────────
const TEST_CONFIG_DIR = process.env.TEST_CONFIG_DIR || '';
function testPath(systemPath) {
  if (TEST_CONFIG_DIR) {
    const basename = require('path').basename(systemPath);
    return require('path').join(TEST_CONFIG_DIR, basename);
  }
  return systemPath;
}
```

Заменить использование жёстких путей на testPath:

```javascript
// Строка 476: const targetPath = '/etc/caddy/Caddyfile';
const targetPath = testPath('/etc/caddy/Caddyfile');
// Строка 477: const tmpPath = '/etc/caddy/Caddyfile.new';
const tmpPath = testPath('/etc/caddy/Caddyfile.new');
// Строка 478: const backupPath = '/etc/caddy/Caddyfile.last';
const backupPath = testPath('/etc/caddy/Caddyfile.last');
// Строка 731: const hyCfgPath = '/etc/hysteria/config.yaml';
const hyCfgPath = testPath('/etc/hysteria/config.yaml');
// Строка 818: const tmpPath = hyCfgPath + '.new';
// (уже использует hyCfgPath, не трогаем)
// Строка 819: const backupPath = hyCfgPath + '.last';
// (уже использует hyCfgPath, не трогаем)
```

- [ ] **Step 2: Add TEST_MODE systemctl stub**

В TEST_MODE systemctl вызовы не должны падать. Заменить `spawn('systemctl', ...)` на заглушку:

```javascript
// После констант добавить:
const TEST_MODE = process.env.TEST_MODE === '1';

// В функциях checkServiceActive, reloadCaddy, reloadHysteria:
if (TEST_MODE) {
  console.log(`[test-mode] skip systemctl ${action} ${unit}`);
  return TEST_MODE_FAKE_RESULT;
}
```

Для `checkServiceActive` при TEST_MODE возвращать `true` (симулируем что сервис активен).

- [ ] **Step 3: Create Dockerfile**

```dockerfile
# tests/integration/docker/panel/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY ../../panel/package*.json ./
RUN npm install --omit=dev
COPY ../../panel/ .
ENV NODE_ENV=test
EXPOSE 3000
CMD ["node", "server/index.js"]
```

Wait — `../../panel/` from `tests/integration/docker/panel/Dockerfile` resolves to the panel dir. Docker build context must be the project root. Fix:

```dockerfile
# Build from project root: docker build -f tests/integration/docker/panel/Dockerfile .
FROM node:20-alpine
WORKDIR /app
COPY panel/package*.json ./
RUN npm install --omit=dev
COPY panel/ .
ENV NODE_ENV=test
EXPOSE 3000
CMD ["node", "server/index.js"]
```

- [ ] **Step 4: Commit**

```bash
git add panel/server/index.js tests/integration/docker/panel/
git commit -m "feat(tests): add TEST_MODE config path override for integration tests"
```

---

### Task 3: Docker infrastructure — certs + Caddy/Naive

**Files:**
- Create: `tests/integration/docker/caddy/Caddyfile`
- Create: `tests/integration/docker/certs/generate.sh`

- [ ] **Step 1: Create generate.sh for self-signed certs**

```bash
#!/bin/sh
# tests/integration/docker/certs/generate.sh
set -e
mkdir -p /certs
# Generate CA
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /certs/ca.key -out /certs/ca.pem \
  -subj '/CN=TestCA'
# Generate server cert signed by CA
openssl req -nodes -newkey rsa:2048 \
  -keyout /certs/server.key -out /certs/server.csr \
  -subj '/CN=test.localhost'
openssl x509 -req -days 365 \
  -in /certs/server.csr -CA /certs/ca.pem -CAkey /certs/ca.key \
  -set_serial 1 -out /certs/server.pem \
  -extfile /dev/stdin <<EOF
subjectAltName=DNS:test.localhost,DNS:localhost,IP:127.0.0.1
EOF
rm /certs/ca.key /certs/server.csr
chmod 644 /certs/*.pem /certs/*.key
echo "Certs generated"
```

- [ ] **Step 2: Create Caddyfile for NaiveProxy**

```
# tests/integration/docker/caddy/Caddyfile
:10443, test.localhost {
    tls internal

    forward_proxy {
        basic_auth testuser testpass123
        hide_ip
        hide_via
        probe_resistance
    }

    file_server {
        root /var/www/html
    }
}
```

- [ ] **Step 3: Create test-server index.html**

```html
<!-- tests/integration/docker/test-server/index.html -->
<!DOCTYPE html>
<html><body><h1>Integration Test Server</h1></body></html>
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/docker/caddy/ tests/integration/docker/certs/ tests/integration/docker/test-server/
git commit -m "feat(tests): add Caddy/Naive config and cert generator"
```

---

### Task 4: Docker infrastructure — Hysteria2

**Files:**
- Create: `tests/integration/docker/hysteria2/Dockerfile`
- Create: `tests/integration/docker/hysteria2/config.yaml`
- Create: `tests/integration/docker/hysteria2/entrypoint.sh`

- [ ] **Step 1: Create config.yaml**

```yaml
# tests/integration/docker/hysteria2/config.yaml
listen: :10444

tls:
  cert: /certs/server.pem
  key: /certs/server.key

auth:
  type: userpass
  userpass:
    testuser: testpass123

masquerade:
  type: file
  file:
    dir: /var/www/html

ignoreClientBandwidth: true
quic:
  initStreamReceiveWindow: 8388608
  maxStreamReceiveWindow: 8388608
  initConnReceiveWindow: 20971520
  maxConnReceiveWindow: 20971520
  maxIdleTimeout: 30s
  keepAlivePeriod: 10s
  disablePathMTUDiscovery: false
```

- [ ] **Step 2: Create entrypoint.sh**

```bash
#!/bin/sh
# tests/integration/docker/hysteria2/entrypoint.sh
set -e
echo "Starting Hysteria2 server..."
exec /usr/local/bin/hysteria server --config /etc/hysteria/config.yaml
```

- [ ] **Step 3: Create Dockerfile**

```dockerfile
# tests/integration/docker/hysteria2/Dockerfile
FROM alpine:3

ARG HY2_VERSION=v2.6.1
ARG TARGETARCH=amd64

RUN apk add --no-cache wget ca-certificates && \
    wget -qO /tmp/hysteria.tar.gz \
      "https://github.com/apernet/hysteria/releases/download/app%2F${HY2_VERSION}/hysteria-linux-${TARGETARCH}.tar.gz" && \
    tar -xzf /tmp/hysteria.tar.gz -C /usr/local/bin/ && \
    chmod +x /usr/local/bin/hysteria && \
    rm /tmp/hysteria.tar.gz

COPY config.yaml /etc/hysteria/config.yaml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 10444/udp
CMD ["/entrypoint.sh"]
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/docker/hysteria2/
git commit -m "feat(tests): add Hysteria2 Docker service"
```

---

### Task 5: Docker Compose

**Files:**
- Create: `tests/integration/docker/docker-compose.yml`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
# tests/integration/docker/docker-compose.yml
services:
  test-server:
    image: nginx:alpine
    container_name: nt-test-server
    volumes:
      - ./test-server/:/usr/share/nginx/html:ro
    networks:
      - testnet
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/"]
      interval: 5s
      timeout: 3s
      retries: 5

  certs:
    image: alpine:3
    container_name: nt-certs
    volumes:
      - cert-data:/certs
    command: sh /certs/generate.sh
    networks:
      - testnet

  caddy-naive:
    image: caddy:latest
    container_name: nt-caddy-naive
    depends_on:
      certs:
        condition: service_completed_successfully
    ports:
      - "10443:10443"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    networks:
      - testnet
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:10443/", "--no-check-certificate"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  hysteria2:
    build:
      context: ./hysteria2
    container_name: nt-hysteria2
    depends_on:
      certs:
        condition: service_completed_successfully
    ports:
      - "10444:10444/udp"
    volumes:
      - cert-data:/certs:ro
    networks:
      - testnet
    healthcheck:
      test: ["CMD-SHELL", "ss -uln | grep -q :10444"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  panel:
    build:
      context: ../../../
      dockerfile: tests/integration/docker/panel/Dockerfile
    container_name: nt-panel
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: test
      PORT: 3000
      TEST_MODE: "1"
      TEST_CONFIG_DIR: /config-share
    volumes:
      - panel-data:/app/data
      - config-share:/config-share
    depends_on:
      caddy-naive:
        condition: service_started
    networks:
      - testnet
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/csrf-token"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 15s

volumes:
  cert-data:
  caddy-data:
  caddy-config:
  panel-data:
  config-share:

networks:
  testnet:
    driver: bridge
```

- [ ] **Step 2: Test docker-compose up**

```bash
cd tests/integration/docker
docker compose up -d
docker compose ps
docker compose logs
curl -sk https://127.0.0.1:10443/ 2>&1 | head -5
curl http://127.0.0.1:3000/api/csrf-token
# hysteria2 UDP port check
ss -uln | grep 10444
```

Expected: all containers healthy, ports responding.

- [ ] **Step 3: Tear down**

```bash
docker compose down -v
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/docker/docker-compose.yml
git commit -m "feat(tests): add Docker Compose for integration test services"
```

---

### Task 6: Python helpers — SingBoxClient

**Files:**
- Create: `tests/integration/helpers/__init__.py`
- Create: `tests/integration/helpers/singbox_client.py`

- [ ] **Step 1: Create helpers/__init__.py** (empty file)

- [ ] **Step 2: Create SingBoxClient class**

```python
# tests/integration/helpers/singbox_client.py
import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path


class SingBoxClient:
    """Manages a sing-box client subprocess for testing proxy connectivity."""

    def __init__(
        self,
        proxy_type: str,
        server: str,
        port: int,
        username: str = "",
        password: str = "",
        socks_port: int = 10801,
        sing_box_bin: str = "sing-box",
        tls_insecure: bool = True,
        server_name: str = "test.localhost",
    ):
        self.proxy_type = proxy_type
        self.server = server
        self.port = port
        self.username = username
        self.password = password
        self.socks_port = socks_port
        self.sing_box_bin = sing_box_bin
        self.tls_insecure = tls_insecure
        self.server_name = server_name
        self._process: subprocess.Popen | None = None
        self._tmp_dir: tempfile.TemporaryDirectory | None = None
        self._config_path: Path | None = None

    def _build_config(self) -> dict:
        outbound = self._build_outbound()
        return {
            "log": {"level": "error", "output": ""},
            "inbounds": [
                {
                    "type": "socks",
                    "tag": "socks-in",
                    "listen": "127.0.0.1",
                    "listen_port": self.socks_port,
                    "sniff": True,
                }
            ],
            "outbounds": [
                outbound,
                {"type": "direct", "tag": "direct"},
            ],
            "route": {
                "rules": [
                    {
                        "inbound": ["socks-in"],
                        "outbound": "proxy",
                    }
                ]
            },
        }

    def _build_outbound(self) -> dict:
        common = {
            "tag": "proxy",
            "server": self.server,
            "server_port": self.port,
        }
        if self.proxy_type == "naive":
            outbound = {
                "type": "naive",
                **common,
                "username": self.username,
                "password": self.password,
                "tls": {
                    "enabled": True,
                    "insecure": self.tls_insecure,
                    "server_name": self.server_name,
                },
            }
        elif self.proxy_type == "hysteria2":
            outbound = {
                "type": "hysteria2",
                **common,
                "password": self.password,
                "tls": {
                    "enabled": True,
                    "insecure": self.tls_insecure,
                    "server_name": self.server_name,
                },
            }
        else:
            raise ValueError(f"Unknown proxy type: {self.proxy_type}")
        return outbound

    def start(self):
        if self._process:
            return
        self._tmp_dir = tempfile.TemporaryDirectory(prefix="singbox-")
        self._config_path = Path(self._tmp_dir.name) / "config.json"
        config = self._build_config()
        self._config_path.write_text(json.dumps(config, indent=2))
        self._process = subprocess.Popen(
            [self.sing_box_bin, "run", "-c", str(self._config_path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        # Wait for the SOCKS port to be ready
        for _ in range(20):
            if self._is_port_open():
                return
            time.sleep(0.5)
        raise RuntimeError(
            f"sing-box client failed to start (port {self.socks_port} not open)"
        )

    def stop(self):
        if self._process:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
            self._process = None
        if self._tmp_dir:
            self._tmp_dir.cleanup()
            self._tmp_dir = None

    def _is_port_open(self) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", self.socks_port), timeout=1):
                return True
        except (ConnectionRefusedError, OSError):
            return False

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *args):
        self.stop()
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/helpers/
git commit -m "feat(tests): add SingBoxClient helper for integration tests"
```

---

### Task 7: Python helpers — PanelClient + checkers

**Files:**
- Create: `tests/integration/helpers/panel_client.py`
- Create: `tests/integration/helpers/checkers.py`

- [ ] **Step 1: Create PanelClient**

```python
# tests/integration/helpers/panel_client.py
import requests


class PanelClient:
    """HTTP client for the panel management API."""

    def __init__(self, base_url: str = "http://127.0.0.1:3000"):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.csrf_token: str | None = None

    def _get_csrf(self):
        resp = self.session.get(f"{self.base_url}/api/csrf-token")
        resp.raise_for_status()
        data = resp.json()
        self.csrf_token = data.get("csrfToken", "")
        return self.csrf_token

    def login(self, username: str = "admin", password: str = "admin") -> bool:
        self._get_csrf()
        resp = self.session.post(
            f"{self.base_url}/api/login",
            json={"username": username, "password": password},
            headers={"X-CSRF-Token": self.csrf_token or ""},
        )
        return resp.json().get("success", False)

    def _api_call(self, method: str, path: str, **kwargs):
        if self.csrf_token:
            headers = kwargs.pop("headers", {})
            headers["X-CSRF-Token"] = self.csrf_token
            kwargs["headers"] = headers
        resp = self.session.request(method, f"{self.base_url}{path}", **kwargs)
        resp.raise_for_status()
        return resp.json()

    def create_naive_user(
        self, username: str, password: str, expire_days: int = 0
    ) -> dict:
        return self._api_call(
            "POST",
            "/api/naive/users",
            json={"username": username, "password": password, "expireDays": expire_days},
        )

    def delete_naive_user(self, username: str) -> dict:
        return self._api_call("DELETE", f"/api/naive/users/{username}")

    def get_naive_users(self) -> list:
        return self._api_call("GET", "/api/naive/users").get("users", [])

    def create_hy2_user(
        self, username: str, password: str, expire_days: int = 0
    ) -> dict:
        return self._api_call(
            "POST",
            "/api/hy2/users",
            json={"username": username, "password": password, "expireDays": expire_days},
        )

    def delete_hy2_user(self, username: str) -> dict:
        return self._api_call("DELETE", f"/api/hy2/users/{username}")

    def get_hy2_users(self) -> list:
        return self._api_call("GET", "/api/hy2/users").get("users", [])

    def change_user_expiry(self, proto: str, username: str, expire_days: int) -> dict:
        endpoint = "naive" if proto == "naive" else "hy2"
        return self._api_call(
            "PATCH",
            f"/api/{endpoint}/users/{username}",
            json={"expireDays": expire_days},
        )

    def get_config(self) -> dict:
        return self._api_call("GET", "/api/config")

    def get_status(self) -> dict:
        return self._api_call("GET", "/api/status")
```

- [ ] **Step 2: Create checkers**

```python
# tests/integration/helpers/checkers.py
import socket
import time

import requests


def check_tcp_through_proxy(
    socks_host: str = "127.0.0.1",
    socks_port: int = 10801,
    target_url: str = "http://test-server/health",
    timeout: int = 10,
) -> bool:
    """Check TCP connectivity through a SOCKS5 proxy."""
    try:
        proxies = {
            "http": f"socks5h://{socks_host}:{socks_port}",
            "https": f"socks5h://{socks_host}:{socks_port}",
        }
        resp = requests.get(target_url, proxies=proxies, timeout=timeout)
        return resp.status_code == 200
    except (requests.RequestException, ConnectionError, OSError):
        return False


def check_udp_through_proxy(
    socks_host: str = "127.0.0.1",
    socks_port: int = 10801,
    timeout: int = 10,
) -> bool:
    """Check UDP connectivity through a SOCKS5 proxy via DNS query."""
    try:
        import socks

        s = socks.socksocket()
        s.set_proxy(socks.SOCKS5, socks_host, socks_port, udp=True)
        s.settimeout(timeout)
        # Simple DNS query for example.com (A record)
        dns_query = bytes([
            0x00, 0x01,  # Transaction ID
            0x01, 0x00,  # Flags: standard query
            0x00, 0x01,  # Questions: 1
            0x00, 0x00,  # Answer RRs
            0x00, 0x00,  # Authority RRs
            0x00, 0x00,  # Additional RRs
            7, ord('e'), ord('x'), ord('a'), ord('m'), ord('p'), ord('l'), ord('e'),
            3, ord('c'), ord('o'), ord('m'),
            0x00,        # End of domain
            0x00, 0x01,  # Type A
            0x00, 0x01,  # Class IN
        ])
        s.sendto(dns_query, ("8.8.8.8", 53))
        data, _ = s.recvfrom(512)
        s.close()
        return len(data) > 0
    except (socket.timeout, OSError, ImportError):
        return False


def wait_for_proxy(
    checker_fn,
    timeout: int = 30,
    interval: float = 1.0,
    **kwargs,
) -> bool:
    """Poll a checker function until it succeeds or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if checker_fn(**kwargs):
            return True
        time.sleep(interval)
    return False
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/helpers/
git commit -m "feat(tests): add PanelClient and connectivity checkers"
```

---

### Task 8: conftest.py fixtures

**Files:**
- Create: `tests/integration/conftest.py`

- [ ] **Step 1: Create conftest.py**

```python
# tests/integration/conftest.py
import os
import subprocess
import time
from pathlib import Path

import pytest

from helpers.panel_client import PanelClient
from helpers.singbox_client import SingBoxClient

DOCKER_DIR = Path(__file__).parent / "docker"
COMPOSE_FILE = DOCKER_DIR / "docker-compose.yml"
SING_BOX_BIN = os.environ.get(
    "TEST_SING_BOX_BIN",
    str(Path(__file__).parent / "bin" / "sing-box"),
)
PANEL_URL = os.environ.get("TEST_PANEL_URL", "http://127.0.0.1:3000")
NAIVE_PORT = int(os.environ.get("TEST_CADDY_NAIVE_PORT", "10443"))
HY2_PORT = int(os.environ.get("TEST_HY2_PORT", "10444"))
TEST_SERVER_URL = os.environ.get(
    "TEST_SERVER_URL", "http://test-server/"
)
CLEANUP_ON_FAILURE = os.environ.get("TEST_CLEANUP_ON_FAILURE", "1") == "1"


def docker_compose(*args, capture_output=True):
    cmd = ["docker", "compose", "-f", str(COMPOSE_FILE), *args]
    kwargs = {}
    if capture_output:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
    result = subprocess.run(cmd, cwd=DOCKER_DIR, **kwargs)
    return result


@pytest.fixture(scope="session")
def docker_services():
    """Start all Docker services, wait for health, yield, tear down."""
    # Start services
    docker_compose("up", "-d", "--build", capture_output=False)
    try:
        # Wait for all services to be healthy
        timeout = 60
        deadline = time.time() + timeout
        while time.time() < deadline:
            result = docker_compose("ps", "--format", "json")
            if result.returncode == 0:
                lines = [l for l in result.stdout.decode().strip().split("\n") if l]
                all_healthy = True
                for line in lines:
                    try:
                        import json as j
                        status = j.loads(line).get("Status", "")
                        if "unhealthy" in status.lower():
                            all_healthy = False
                            break
                        if "starting" in status.lower() or "created" in status.lower():
                            all_healthy = False
                    except (j.JSONDecodeError, KeyError):
                        pass
                if all_healthy and len(lines) >= 3:
                    break
            time.sleep(3)
        yield
    finally:
        if CLEANUP_ON_FAILURE:
            docker_compose("down", "-v", capture_output=False)


@pytest.fixture(scope="session")
def panel_api(docker_services):
    """Logged-in PanelClient instance."""
    client = PanelClient(PANEL_URL)
    # Retry login until panel is ready
    for _ in range(30):
        try:
            if client.login():
                return client
        except Exception:
            pass
        time.sleep(2)
    pytest.fail("Failed to login to panel API")


@pytest.fixture(scope="session")
def naive_server(docker_services):
    """Return Caddy Naive server connection params."""
    return {
        "server": "127.0.0.1",
        "port": NAIVE_PORT,
        "server_name": "test.localhost",
    }


@pytest.fixture(scope="session")
def hy2_server(docker_services):
    """Return Hysteria2 server connection params."""
    return {
        "server": "127.0.0.1",
        "port": HY2_PORT,
        "server_name": "test.localhost",
    }


@pytest.fixture
def singbox_factory():
    """Factory fixture: returns function that creates/manages SingBoxClient."""
    clients = []

    def _create(proxy_type: str, server: str, port: int, username: str, password: str, **kwargs):
        client = SingBoxClient(
            proxy_type=proxy_type,
            server=server,
            port=port,
            username=username,
            password=password,
            sing_box_bin=str(SING_BOX_BIN),
            **kwargs,
        )
        clients.append(client)
        return client

    yield _create

    # Cleanup all clients
    for c in clients:
        try:
            c.stop()
        except Exception:
            pass


@pytest.fixture(scope="session")
def test_server_url():
    return TEST_SERVER_URL
```

- [ ] **Step 2: Commit**

```bash
git add tests/integration/conftest.py
git commit -m "feat(tests): add pytest fixtures for Docker services and sing-box"
```

---

### Task 9: Test — NaiveProxy connectivity

**Files:**
- Create: `tests/integration/tests/__init__.py`
- Create: `tests/integration/tests/test_naive_connectivity.py`

- [ ] **Step 1: Create tests/__init__.py** (empty)

- [ ] **Step 2: Create the test file**

```python
# tests/integration/tests/test_naive_connectivity.py
import pytest
from helpers.checkers import check_tcp_through_proxy, wait_for_proxy


class TestNaiveConnectivity:
    """Integration tests for NaiveProxy via Caddy."""

    @pytest.fixture(autouse=True)
    def _setup_test_user(self, panel_api):
        """Create a test user before each test, delete after."""
        self.username = "naive_test"
        self.password = "NaivePass123!"
        result = panel_api.create_naive_user(self.username, self.password)
        assert result.get("success"), f"Failed to create naive user: {result}"
        yield
        panel_api.delete_naive_user(self.username)

    def test_naive_tcp_connectivity(self, panel_api, naive_server, singbox_factory):
        """Create Naive user → connect via sing-box → verify TCP proxy works."""
        with singbox_factory(
            proxy_type="naive",
            server=naive_server["server"],
            port=naive_server["port"],
            username=self.username,
            password=self.password,
            server_name=naive_server["server_name"],
            socks_port=10811,
        ) as client:
            assert wait_for_proxy(
                check_tcp_through_proxy,
                socks_port=10811,
                target_url="http://test-server/",
                timeout=15,
            ), "Naive TCP proxy connection failed"

    def test_naive_auth_rejection(self, panel_api, naive_server, singbox_factory):
        """Connect with wrong password → must fail."""
        with singbox_factory(
            proxy_type="naive",
            server=naive_server["server"],
            port=naive_server["port"],
            username=self.username,
            password="WrongPass123!",
            server_name=naive_server["server_name"],
            socks_port=10812,
        ) as client:
            assert not wait_for_proxy(
                check_tcp_through_proxy,
                socks_port=10812,
                target_url="http://test-server/",
                timeout=10,
            ), "Naive proxy should reject wrong credentials"
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tests/
git commit -m "feat(tests): add NaiveProxy integration test"
```

---

### Task 10: Test — Hysteria2 connectivity

**Files:**
- Create: `tests/integration/tests/test_hysteria2_connectivity.py`

- [ ] **Step 1: Create the test file**

```python
# tests/integration/tests/test_hysteria2_connectivity.py
import pytest
from helpers.checkers import check_tcp_through_proxy, check_udp_through_proxy, wait_for_proxy


class TestHysteria2Connectivity:
    """Integration tests for Hysteria2."""

    @pytest.fixture(autouse=True)
    def _setup_test_user(self, panel_api):
        self.username = "hy2_test"
        self.password = "Hy2Pass123!"
        result = panel_api.create_hy2_user(self.username, self.password)
        assert result.get("success"), f"Failed to create hy2 user: {result}"
        yield
        panel_api.delete_hy2_user(self.username)

    def test_hy2_tcp_connectivity(self, panel_api, hy2_server, singbox_factory):
        """Create Hysteria2 user → connect → verify TCP proxy works."""
        with singbox_factory(
            proxy_type="hysteria2",
            server=hy2_server["server"],
            port=hy2_server["port"],
            username=self.username,
            password=self.password,
            server_name=hy2_server["server_name"],
            socks_port=10821,
        ) as client:
            assert wait_for_proxy(
                check_tcp_through_proxy,
                socks_port=10821,
                target_url="http://test-server/",
                timeout=20,
            ), "Hysteria2 TCP proxy connection failed"

    def test_hy2_udp_connectivity(self, panel_api, hy2_server, singbox_factory):
        """Create Hysteria2 user → connect → verify UDP proxy works."""
        with singbox_factory(
            proxy_type="hysteria2",
            server=hy2_server["server"],
            port=hy2_server["port"],
            username=self.username,
            password=self.password,
            server_name=hy2_server["server_name"],
            socks_port=10822,
        ) as client:
            assert wait_for_proxy(
                check_udp_through_proxy,
                socks_port=10822,
                timeout=20,
            ), "Hysteria2 UDP proxy connection failed"
```

- [ ] **Step 2: Commit**

```bash
git add tests/integration/tests/test_hysteria2_connectivity.py
git commit -m "feat(tests): add Hysteria2 TCP+UDP integration test"
```

---

### Task 11: Test — multiple clients + user lifecycle

**Files:**
- Create: `tests/integration/tests/test_multiple_clients.py`
- Create: `tests/integration/tests/test_user_lifecycle.py`

- [ ] **Step 1: Multi-client test**

```python
# tests/integration/tests/test_multiple_clients.py
import pytest
from helpers.checkers import check_tcp_through_proxy, check_udp_through_proxy, wait_for_proxy


class TestMultipleClients:
    """Test multiple simultaneous proxy connections."""

    def test_multiple_naive_clients(self, panel_api, naive_server, singbox_factory):
        """Create 3 Naive users and connect simultaneously."""
        users = []
        clients = []
        try:
            for i in range(3):
                u = f"mc_naive_{i}"
                p = f"NaiveMulti{i}!"
                assert panel_api.create_naive_user(u, p).get("success")
                users.append((u, p))

            for i, (u, p) in enumerate(users):
                c = singbox_factory(
                    proxy_type="naive",
                    server=naive_server["server"],
                    port=naive_server["port"],
                    username=u,
                    password=p,
                    server_name=naive_server["server_name"],
                    socks_port=10831 + i,
                )
                c.start()
                clients.append(c)

            for i in range(3):
                assert wait_for_proxy(
                    check_tcp_through_proxy,
                    socks_port=10831 + i,
                    target_url="http://test-server/",
                    timeout=15,
                ), f"Client {i} failed"
        finally:
            for c in clients:
                c.stop()
            for u, _ in users:
                panel_api.delete_naive_user(u)

    def test_mixed_protocol_clients(self, panel_api, naive_server, hy2_server, singbox_factory):
        """Create both Naive and Hysteria2 users, connect simultaneously."""
        na = ("mc_mixed_n", "NaiveMixed1!")
        hy = ("mc_mixed_h", "Hy2Mixed1!")
        assert panel_api.create_naive_user(*na).get("success")
        assert panel_api.create_hy2_user(*hy).get("success")

        c1 = singbox_factory(proxy_type="naive", server=naive_server["server"],
                             port=naive_server["port"], username=na[0], password=na[1],
                             server_name=naive_server["server_name"], socks_port=10841)
        c2 = singbox_factory(proxy_type="hysteria2", server=hy2_server["server"],
                             port=hy2_server["port"], username=hy[0], password=hy[1],
                             server_name=hy2_server["server_name"], socks_port=10842)
        try:
            c1.start()
            c2.start()
            assert wait_for_proxy(check_tcp_through_proxy, socks_port=10841, timeout=15)
            assert wait_for_proxy(check_tcp_through_proxy, socks_port=10842, timeout=20)
            assert wait_for_proxy(check_udp_through_proxy, socks_port=10842, timeout=20)
        finally:
            c1.stop()
            c2.stop()
            panel_api.delete_naive_user(na[0])
            panel_api.delete_hy2_user(hy[0])
```

- [ ] **Step 2: User lifecycle test**

```python
# tests/integration/tests/test_user_lifecycle.py
import time
import pytest
from helpers.checkers import check_tcp_through_proxy, wait_for_proxy


class TestUserLifecycle:
    """Test user creation → expiry → renewal."""

    @pytest.fixture(params=["naive", "hysteria2"])
    def proto(self, request):
        return request.param

    def test_create_and_connect(self, proto, panel_api, naive_server, hy2_server, singbox_factory):
        """Create user (unlimited), connect, then delete and verify rejection."""
        uname = f"lifecycle_{proto}_{int(time.time())}"
        passwd = "Lifecycle1!"
        server = naive_server if proto == "naive" else hy2_server
        port = 10851 if proto == "naive" else 10852
        create_fn = panel_api.create_naive_user if proto == "naive" else panel_api.create_hy2_user
        delete_fn = panel_api.delete_naive_user if proto == "naive" else panel_api.delete_hy2_user

        assert create_fn(uname, passwd).get("success")

        with singbox_factory(proxy_type=proto, server=server["server"],
                             port=server["port"], username=uname,
                             password=passwd, server_name=server["server_name"],
                             socks_port=port) as client:
            assert wait_for_proxy(check_tcp_through_proxy, socks_port=port, timeout=15), \
                f"{proto}: user should connect"

        # Delete user
        delete_fn(uname)

        # Verify connection fails
        with singbox_factory(proxy_type=proto, server=server["server"],
                             port=server["port"], username=uname,
                             password=passwd, server_name=server["server_name"],
                             socks_port=port + 10) as client:
            assert not wait_for_proxy(check_tcp_through_proxy, socks_port=port + 10, timeout=10), \
                f"{proto}: deleted user should not connect"

    def test_expiry_renew(self, proto, panel_api, naive_server, hy2_server, singbox_factory):
        """Create with 0-day (unlimited), change to 0-day, verify it still works."""
        uname = f"renew_{proto}_{int(time.time())}"
        passwd = "RenewPass1!"
        server = naive_server if proto == "naive" else hy2_server
        port = 10861 if proto == "naive" else 10862
        create_fn = panel_api.create_naive_user if proto == "naive" else panel_api.create_hy2_user
        change_fn = panel_api.change_user_expiry

        assert create_fn(uname, passwd, expire_days=0).get("success")

        with singbox_factory(proxy_type=proto, server=server["server"],
                             port=server["port"], username=uname,
                             password=passwd, server_name=server["server_name"],
                             socks_port=port) as client:
            assert wait_for_proxy(check_tcp_through_proxy, socks_port=port, timeout=15)

        # Renew
        result = change_fn(proto, uname, expire_days=30)
        assert result.get("success"), f"Renew failed: {result}"

        # Still works
        with singbox_factory(proxy_type=proto, server=server["server"],
                             port=server["port"], username=uname,
                             password=passwd, server_name=server["server_name"],
                             socks_port=port + 10) as client:
            assert wait_for_proxy(check_tcp_through_proxy, socks_port=port + 10, timeout=15)

        # Cleanup
        delete_fn = panel_api.delete_naive_user if proto == "naive" else panel_api.delete_hy2_user
        delete_fn(uname)
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tests/
git commit -m "feat(tests): add multi-client and user lifecycle integration tests"
```

---

### Task 12: Run tests and fix issues

**Files:** none (run existing)

- [ ] **Step 1: Start Docker services**

```bash
cd tests/integration/docker && docker compose up -d --build && docker compose ps
```

- [ ] **Step 2: Activate venv and run tests**

```bash
cd tests/integration && source venv/bin/activate && python -m pytest tests/ -v --tb=short 2>&1
```

Expected: all tests pass or clear failure messages.

- [ ] **Step 3: Fix any issues found (Docker config, panel integration, etc.)**

Iterate on failures. Common issues:
- Caddy `tls internal` might need DNS or `/etc/hosts` entry for test.localhost
- Hysteria2 Dockerfile version might need updating
- sing-box config might need adjustment for TLS
- Panel API CSRF handling

- [ ] **Step 4: Tear down**

```bash
docker compose down -v
```

- [ ] **Step 5: Add run.sh convenience script**

```bash
#!/bin/bash
# tests/integration/run.sh - Run integration tests
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Activate venv
source "${SCRIPT_DIR}/venv/bin/activate"

# Ensure sing-box binary exists
if ! command -v "${SCRIPT_DIR}/bin/sing-box" &>/dev/null; then
    echo "sing-box binary not found. Run: bash setup.sh"
    exit 1
fi

# Start Docker services
echo "Starting Docker services..."
docker compose -f "${SCRIPT_DIR}/docker/docker-compose.yml" up -d --build

# Run tests
echo "Running tests..."
cd "${SCRIPT_DIR}"
python -m pytest tests/ -v --tb=short "$@"
EXIT_CODE=$?

# Cleanup
echo "Stopping Docker services..."
docker compose -f "${SCRIPT_DIR}/docker/docker-compose.yml" down -v

exit $EXIT_CODE
```

```bash
chmod +x tests/integration/run.sh
```

- [ ] **Step 6: Create setup.sh**

```bash
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
```

```bash
chmod +x tests/integration/setup.sh
```

- [ ] **Step 7: Commit**

```bash
git add tests/integration/run.sh tests/integration/setup.sh
git commit -m "feat(tests): add setup.sh and run.sh for integration tests"
```

---

## Self-Review

### Spec Coverage
- `test_naive_connectivity.py` → covers Naive TCP test ✓
- `test_hysteria2_connectivity.py` → covers Hysteria2 TCP+UDP ✓
- `test_multiple_clients.py` → covers 3 clients + mixed protocols ✓
- `test_user_lifecycle.py` → covers create/delete/renew for both protocols ✓
- Panel TEST_MODE seam → Task 2 ✓
- Docker Compose → Task 5 ✓
- TCP+UDP verification → Task 7 (checkers.py) ✓

### Placeholder Scan
No TBD, TODO, "fill in details", or other placeholders found.

### Type Consistency
- `SingBoxClient.__init__` params match test usage (proxy_type, server, port, etc.) ✓
- `PanelClient` method names consistent across helpers and tests ✓
- `check_tcp_through_proxy`/`check_udp_through_proxy` signatures match `wait_for_proxy` kwargs pattern ✓
