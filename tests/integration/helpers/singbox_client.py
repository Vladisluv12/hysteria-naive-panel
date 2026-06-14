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
        certificate_path: str = "",
        quic: bool = False,
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
        self.certificate_path = certificate_path
        self.quic = quic
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
            tls_config = {
                "enabled": True,
                "server_name": self.server_name,
            }
            if self.certificate_path:
                tls_config["certificate_path"] = self.certificate_path
            outbound = {
                "type": "naive",
                **common,
                "username": self.username,
                "password": self.password,
                "tls": tls_config,
            }
            if self.quic:
                outbound["quic"] = True
        elif self.proxy_type == "hysteria2":
            outbound = {
                "type": "hysteria2",
                **common,
                "password": f"{self.username}:{self.password}",
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
