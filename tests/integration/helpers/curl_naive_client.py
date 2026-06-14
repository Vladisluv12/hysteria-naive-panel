import subprocess
import tempfile
import time
from pathlib import Path


class CurlNaiveClient:
    """Manages curl-based naive proxy client for testing."""

    def __init__(
        self,
        server: str,
        port: int,
        username: str,
        password: str,
        server_name: str = "test.localhost",
        socks_port: int = 10800,
    ):
        self.server = server
        self.port = port
        self.username = username
        self.password = password
        self.server_name = server_name
        self.socks_port = socks_port
        self._process: subprocess.Popen | None = None
        self._tmp_dir: tempfile.TemporaryDirectory | None = None

    def start(self):
        return

    def stop(self):
        pass

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *args):
        self.stop()

    def get_proxy_url(self) -> str:
        return f"https://{self.username}:{self.password}@{self.server_name}:{self.port}"

    def test_connection(self, target_url: str = "http://test-server/") -> bool:
        try:
            result = subprocess.run(
                [
                    "curl",
                    "-sk",
                    "--connect-timeout", "5",
                    "--proxy-insecure",
                    "--proxy", self.get_proxy_url(),
                    "-p", "--proxytunnel",
                    target_url,
                    "-o", "/dev/null",
                    "-w", "%{http_code}",
                    "-s",
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.stdout.strip() in ["200", "301", "302"]
        except Exception:
            return False