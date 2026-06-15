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
CLEANUP_ON_FAILURE = os.environ.get("TEST_CLEANUP_ON_FAILURE", "0") == "1"


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
    docker_compose("up", "-d", "--build", capture_output=False)
    try:
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
                if all_healthy and len(lines) >= 4:
                    break
            time.sleep(3)
        yield
    finally:
        if CLEANUP_ON_FAILURE:
            docker_compose("down", "-v", capture_output=False)


def docker_reload_caddy():
    """Reload Caddy config via docker exec (fallback if admin API unavailable)."""
    subprocess.run(
        ["docker", "exec", "nt-caddy-naive", "caddy", "reload", "--config", "/etc/caddy/Caddyfile"],
        capture_output=True, timeout=10,
    )


def docker_restart_hysteria():
    """Restart Hysteria2 container to pick up config changes."""
    subprocess.run(
        ["docker", "restart", "nt-hysteria2"],
        capture_output=True, timeout=30,
    )
    time.sleep(3)


@pytest.fixture(scope="session")
def panel_api(docker_services):
    """Logged-in PanelClient instance."""
    client = PanelClient(
        PANEL_URL,
        on_change_naive=docker_reload_caddy,
        on_change_hy2=docker_restart_hysteria,
    )
    for _ in range(10):
        try:
            resp = client.session.post(
                f"{PANEL_URL}/api/login",
                json={"username": "admin", "password": "admin"},
            )
            if resp.status_code == 200 and resp.json().get("success"):
                return client
            if resp.status_code == 429:
                pytest.fail("Panel login rate-limited during fixture setup — restart containers")
        except Exception:
            pass
        time.sleep(3)
    pytest.fail("Failed to login to panel API")


@pytest.fixture(scope="session")
def panel_sqlite_api(docker_services):
    """Logged-in PanelClient for SQLite-enabled panel on port 3001."""
    sqlite_url = "http://127.0.0.1:3001"
    client = PanelClient(sqlite_url)
    for _ in range(10):
        try:
            resp = client.session.post(
                f"{sqlite_url}/api/login",
                json={"username": "admin", "password": "admin"},
            )
            if resp.status_code == 200 and resp.json().get("success"):
                return client
        except Exception:
            pass
        time.sleep(3)
    pytest.fail("Failed to login to panel-sqlite API")


class DockerPanelControl:
    """Manages main panel container lifecycle for migration tests."""

    CONTAINER = "nt-panel"
    IMAGE = "docker-panel"
    VOLUME = "docker_panel-data"
    PORT = "3000:3000"

    def _docker(self, *args, **kwargs):
        return subprocess.run(["docker", *args], **kwargs)

    def stop(self):
        subprocess.run(["docker", "stop", self.CONTAINER], capture_output=True)
        subprocess.run(["docker", "rm", self.CONTAINER], capture_output=True)

    def start(self, extra_env=None):
        env_args = [
            "-e", "NODE_ENV=production",
            "-e", "PORT=3000",
            "-e", "LISTEN_HOST=0.0.0.0",
            "-e", "TEST_MODE=1",
            "-e", f"TEST_CONFIG_DIR=/config-share",
        ]
        if extra_env:
            for k, v in extra_env.items():
                env_args.extend(["-e", f"{k}={v}"])

        subprocess.run(
            ["docker", "run", "-d", "--name", self.CONTAINER,
             "-p", self.PORT,
             "-v", f"{self.VOLUME}:/app/data",
             "-v", "docker_proxy-config-share:/config-share",
             "--network", "docker_testnet",
             *env_args,
             self.IMAGE],
            capture_output=True,
        )

    def restart(self, extra_env=None):
        self.stop()
        self.start(extra_env=extra_env)

    def wait_ready(self, timeout=30):
        import requests as req
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                r = req.post(
                    "http://127.0.0.1:3000/api/login",
                    json={"username": "admin", "password": "admin"},
                    timeout=2,
                )
                if r.status_code == 200:
                    return True
            except Exception:
                pass
            time.sleep(2)
        return False

    def exec_read(self, filepath):
        result = subprocess.run(
            ["docker", "exec", self.CONTAINER, "cat", filepath],
            capture_output=True, text=True, timeout=5,
        )
        return result.stdout if result.returncode == 0 else None

    def exec_exists(self, filepath):
        result = subprocess.run(
            ["docker", "exec", self.CONTAINER, "test", "-f", filepath],
            capture_output=True, timeout=5,
        )
        return result.returncode == 0

    def exec_sqlite_select(self, query):
        result = subprocess.run(
            ["docker", "exec", self.CONTAINER,
             "sqlite3", "/app/data/panel.db", query],
            capture_output=True, text=True, timeout=5,
        )
        return result.stdout if result.returncode == 0 else None


@pytest.fixture(scope="session")
def docker_panel_control(docker_services):
    """Returns DockerPanelControl instance for migration tests."""
    return DockerPanelControl()


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

    for c in clients:
        try:
            c.stop()
        except Exception:
            pass


@pytest.fixture(scope="session")
def test_server_url():
    return TEST_SERVER_URL
