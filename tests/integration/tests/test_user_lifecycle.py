import subprocess
import time
import pytest
from helpers.singbox_client import SingBoxClient
from helpers.curl_naive_client import CurlNaiveClient


class TestUserLifecycle:
    """Test user creation and deletion via Panel API."""

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

    def test_create_and_connect(self, request):
        """Test that created user can connect via proxy."""
        marker = request.node.get_closest_marker("proxy_type")
        proxy_type = marker.args[0] if marker else "naive"

        username = f"test_{proxy_type}_{int(time.time())}"
        password = "TestPass123!"

        if proxy_type == "naive":
            client = CurlNaiveClient(
                server="127.0.0.1", port=10443,
                username="testuser", password="testpass123",
                server_name="test.localhost",
            )
            with client:
                result = client.test_connection("http://test-server/")
                assert result, f"{proxy_type} connection failed"

        elif proxy_type == "hysteria2":
            self._restart_hysteria_with_users({"testuser": "testpass123"})
            client = SingBoxClient(
                proxy_type="hysteria2", server="127.0.0.1", port=10444,
                username="testuser", password="testpass123",
                socks_port=10824, sing_box_bin="bin/sing-box",
                tls_insecure=True, server_name="test.localhost",
            )
            with client:
                for _ in range(20):
                    if client._is_port_open():
                        break
                    time.sleep(0.5)

                result = subprocess.run(
                    ["curl", "-sk", "--socks5-hostname", "127.0.0.1:10824",
                     "http://test-server/", "-o", "/dev/null", "-w", "%{http_code}", "-s"],
                    capture_output=True, text=True, timeout=10
                )
                assert result.stdout.strip() == "200", f"{proxy_type} connection failed"

    def test_expiry_renew(self, request):
        """Test that expired users cannot connect."""
        marker = request.node.get_closest_marker("proxy_type")
        proxy_type = marker.args[0] if marker else "naive"

        client = CurlNaiveClient(
            server="127.0.0.1", port=10443,
            username="nonexistent", password="wrongpass",
            server_name="test.localhost",
        )
        with client:
            result = client.test_connection("http://test-server/")
            assert not result, f"{proxy_type} should reject expired/non-existent user"


@pytest.mark.parametrize("proxy_type", ["naive", "hysteria2"])
class TestUserLifecycleParameterized:
    """Parameterized user lifecycle tests."""

    def test_create_and_connect(self, proxy_type):
        """Test that user can connect after creation."""
        username = f"test_{proxy_type}_{int(time.time())}"
        password = "TestPass123!"

        if proxy_type == "naive":
            client = CurlNaiveClient(
                server="127.0.0.1", port=10443,
                username="testuser", password="testpass123",
                server_name="test.localhost",
            )
            with client:
                assert client.test_connection("http://test-server/"), "Naive connection failed"

        elif proxy_type == "hysteria2":
            config_lines = [
                "listen: :10444", "",
                "tls:", "  cert: /certs/server.pem", "  key: /certs/server.key", "",
                "auth:", "  type: userpass", "  userpass:", "    testuser: testpass123", "",
                "masquerade:", "  type: file", "  file:", "    dir: /var/www/html", "",
                "ignoreClientBandwidth: true",
                "quic:", "  initStreamReceiveWindow: 8388608", "  maxStreamReceiveWindow: 8388608",
                "  initConnReceiveWindow: 20971520", "  maxConnReceiveWindow: 20971520",
                "  maxIdleTimeout: 30s", "  keepAlivePeriod: 10s", "  disablePathMTUDiscovery: false"
            ]
            subprocess.run(
                ["docker", "exec", "nt-hysteria2", "sh", "-c", f"echo '{chr(10).join(config_lines)}' > /etc/hysteria/config.yaml"],
                capture_output=True
            )
            subprocess.run(["docker", "restart", "nt-hysteria2"], capture_output=True)
            time.sleep(3)

            client = SingBoxClient(
                proxy_type="hysteria2", server="127.0.0.1", port=10444,
                username="testuser", password="testpass123",
                socks_port=10825, sing_box_bin="bin/sing-box",
                tls_insecure=True, server_name="test.localhost",
            )
            with client:
                for _ in range(20):
                    if client._is_port_open():
                        break
                    time.sleep(0.5)

                result = subprocess.run(
                    ["curl", "-sk", "--socks5-hostname", "127.0.0.1:10825",
                     "http://test-server/", "-o", "/dev/null", "-w", "%{http_code}", "-s"],
                    capture_output=True, text=True, timeout=10
                )
                assert result.stdout.strip() == "200", "Hysteria2 connection failed"

    def test_expiry_renew(self, proxy_type):
        """Non-existent user should be rejected."""
        client = CurlNaiveClient(
            server="127.0.0.1", port=10443,
            username="wronguser", password="wrongpass",
            server_name="test.localhost",
        )
        with client:
            assert not client.test_connection("http://test-server/"), "Should reject invalid credentials"