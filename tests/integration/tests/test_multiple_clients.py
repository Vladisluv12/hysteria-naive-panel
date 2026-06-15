import subprocess
import time
from pathlib import Path
import pytest
from helpers.singbox_client import SingBoxClient
from helpers.curl_naive_client import CurlNaiveClient


SING_BOX_BIN = str(Path(__file__).parent.parent / "bin" / "sing-box")


class TestMultipleClients:
    """Test multiple concurrent proxy clients."""

    def _restart_hysteria_with_users(self, users: dict):
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
        subprocess.run(["docker", "restart", "nt-hysteria2"], capture_output=True)
        time.sleep(3)

    def test_multiple_naive_clients(self):
        """Multiple naive clients can connect simultaneously."""
        clients = []
        try:
            for i in range(3):
                client = CurlNaiveClient(
                    server="127.0.0.1",
                    port=10443,
                    username="testuser",
                    password="testpass123",
                    server_name="test.localhost",
                )
                clients.append(client)
                client.start()

            for i, client in enumerate(clients):
                result = client.test_connection("http://test-server/")
                assert result, f"Naive client {i+1} failed"
        finally:
            for client in clients:
                try:
                    client.stop()
                except Exception:
                    pass

    def test_mixed_protocol_clients(self):
        """Naive and Hysteria2 clients work simultaneously."""
        self._restart_hysteria_with_users({"testuser": "testpass123"})

        naive = CurlNaiveClient(
            server="127.0.0.1", port=10443,
            username="testuser", password="testpass123",
            server_name="test.localhost",
        )
        hy2 = SingBoxClient(
            proxy_type="hysteria2", server="127.0.0.1", port=10444,
            username="testuser", password="testpass123",
            socks_port=10823, sing_box_bin=SING_BOX_BIN,
            tls_insecure=True, server_name="test.localhost",
        )

        try:
            naive.start()
            hy2.start()

            for _ in range(20):
                if hy2._is_port_open():
                    break
                time.sleep(0.5)

            naive_result = naive.test_connection("http://test-server/")

            hy2_result = subprocess.run(
                ["curl", "-sk", "--socks5-hostname", "127.0.0.1:10823",
                 "http://test-server/", "-o", "/dev/null", "-w", "%{http_code}", "-s"],
                capture_output=True, text=True, timeout=10
            )
            hy2_ok = hy2_result.stdout.strip() == "200"

            assert naive_result, "Naive proxy failed"
            assert hy2_ok, "Hysteria2 proxy failed"
        finally:
            naive.stop()
            hy2.stop()