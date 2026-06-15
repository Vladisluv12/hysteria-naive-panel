import subprocess
import time
from pathlib import Path
import pytest
from helpers.singbox_client import SingBoxClient


SING_BOX_BIN = str(Path(__file__).parent.parent / "bin" / "sing-box")


class TestHysteria2Connectivity:
    """Integration tests for Hysteria2 proxy."""

    def _restart_hysteria_with_users(self, users: dict):
        """Update Hysteria2 config with users and restart container."""
        config_lines = [
            "listen: :10444",
            "",
            "tls:",
            "  cert: /certs/server.pem",
            "  key: /certs/server.key",
            "",
            "auth:",
            "  type: userpass",
            "  userpass:"
        ]
        for username, password in users.items():
            config_lines.append(f"    {username}: {password}")

        config_lines.extend([
            "",
            "masquerade:",
            "  type: file",
            "  file:",
            "    dir: /var/www/html",
            "",
            "ignoreClientBandwidth: true",
            "quic:",
            "  initStreamReceiveWindow: 8388608",
            "  maxStreamReceiveWindow: 8388608",
            "  initConnReceiveWindow: 20971520",
            "  maxConnReceiveWindow: 20971520",
            "  maxIdleTimeout: 30s",
            "  keepAlivePeriod: 10s",
            "  disablePathMTUDiscovery: false"
        ])

        config_content = "\n".join(config_lines)

        subprocess.run(
            ["docker", "exec", "nt-hysteria2", "sh", "-c", f"echo '{config_content}' > /etc/hysteria/config.yaml"],
            capture_output=True
        )
        subprocess.run(
            ["docker", "restart", "nt-hysteria2"],
            capture_output=True
        )
        time.sleep(3)

    def test_hy2_tcp_connectivity(self):
        """Verify TCP proxy works through Hysteria2."""
        self._restart_hysteria_with_users({"testuser": "testpass123"})

        client = SingBoxClient(
            proxy_type="hysteria2",
            server="127.0.0.1",
            port=10444,
            username="testuser",
            password="testpass123",
            socks_port=10821,
            sing_box_bin=SING_BOX_BIN,
            tls_insecure=True,
            server_name="test.localhost",
        )
        with client:
            for _ in range(20):
                if client._is_port_open():
                    break
                time.sleep(0.5)
            assert client._is_port_open(), "sing-box did not open socks port"

            result = subprocess.run(
                ["curl", "-sk", "--socks5-hostname", "127.0.0.1:10821",
                 "http://test-server/", "-o", "/dev/null", "-w", "%{http_code}", "-s"],
                capture_output=True, text=True, timeout=10
            )
            assert result.stdout.strip() == "200", f"Hysteria2 TCP proxy failed: {result.stdout}"

    def test_hy2_udp_connectivity(self):
        """Verify UDP proxy works through Hysteria2."""
        self._restart_hysteria_with_users({"testuser": "testpass123"})

        from helpers.checkers import check_udp_through_proxy

        client = SingBoxClient(
            proxy_type="hysteria2",
            server="127.0.0.1",
            port=10444,
            username="testuser",
            password="testpass123",
            socks_port=10822,
            sing_box_bin=SING_BOX_BIN,
            tls_insecure=True,
            server_name="test.localhost",
        )
        with client:
            for _ in range(20):
                if client._is_port_open():
                    break
                time.sleep(0.5)
            assert client._is_port_open(), "sing-box did not open socks port"

            result = check_udp_through_proxy("127.0.0.1", 10822)
            assert result, "Hysteria2 UDP proxy failed"