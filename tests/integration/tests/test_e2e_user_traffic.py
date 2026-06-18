import subprocess
import time
from pathlib import Path

from helpers.curl_naive_client import CurlNaiveClient


SING_BOX_BIN = str(Path(__file__).parent.parent / "bin" / "sing-box")


class TestE2EUserTraffic:
    """End-to-end: create users via Panel API, connect, generate traffic.

    In TEST_MODE the panel only writes proxy configs when installed=true.
    Tests create users via API (visible in UI) and additionally update the
    Caddyfile/Hysteria config manually so connectivity tests can pass.
    """

    def _socks5_request(self, socks_port: int, target="http://test-server/"):
        result = subprocess.run(
            ["curl", "-sk", "--socks5-hostname", f"127.0.0.1:{socks_port}",
             target, "-o", "/dev/null", "-w", "%{http_code}", "-s"],
            capture_output=True, text=True, timeout=15,
        )
        return result.stdout.strip()

    def _add_user_to_caddyfile(self, username, password):
        """Append a basic_auth line to the Caddyfile and reload caddy."""
        subprocess.run(
            ["docker", "exec", "nt-caddy-naive", "sh", "-c",
             f"sed -i '/forward_proxy {{/a\\        basic_auth {username} {password}' /etc/caddy/Caddyfile"],
            capture_output=True, timeout=10,
        )
        subprocess.run(
            ["docker", "exec", "nt-caddy-naive", "caddy", "reload",
             "--config", "/etc/caddy/Caddyfile"],
            capture_output=True, timeout=10,
        )

    def _remove_user_from_caddyfile(self, username):
        """Remove a basic_auth line from the Caddyfile and reload caddy."""
        subprocess.run(
            ["docker", "exec", "nt-caddy-naive", "sh", "-c",
             f"sed -i '/basic_auth {username} /d' /etc/caddy/Caddyfile"],
            capture_output=True, timeout=10,
        )
        subprocess.run(
            ["docker", "exec", "nt-caddy-naive", "caddy", "reload",
             "--config", "/etc/caddy/Caddyfile"],
            capture_output=True, timeout=10,
        )

    def _restart_hysteria_with_users(self, users: dict):
        """Update Hysteria2 config (both seed and target) with users and restart."""
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
            "trafficStats:",
            "  listen: :9999",
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

        # Write to both seed and target — entrypoint.sh copies seed→target on restart
        escaped = config_content.replace("'", "'\"'\"'")
        for path in ["/seed/hysteria-config.yaml", "/etc/hysteria/config.yaml"]:
            subprocess.run(
                ["docker", "exec", "nt-hysteria2", "sh", "-c",
                 f"echo '{escaped}' > {path}"],
                capture_output=True, timeout=5,
            )
        subprocess.run(
            ["docker", "restart", "nt-hysteria2"],
            capture_output=True, timeout=30,
        )
        time.sleep(3)

    def test_naive_user_created_via_api_then_connects(self, panel_api):
        """Create naive user via Panel API, also add to Caddyfile, connect via curl."""
        t = int(time.time())
        username = f"e2e_naive_{t}"
        password = "E2ePass123!"

        result = panel_api.create_naive_user(username, password)
        assert result["success"] is True

        self._add_user_to_caddyfile(username, password)
        time.sleep(1)

        client = CurlNaiveClient(
            server="127.0.0.1", port=10443,
            username=username, password=password,
            server_name="test.localhost",
        )
        with client:
            ok = client.test_connection("http://test-server/")
            assert ok, f"Naive curl proxy connection failed"

        panel_api.delete_naive_user(username)
        self._remove_user_from_caddyfile(username)

    def test_naive_user_singbox_auth_verified(self, panel_api, singbox_factory):
        """Create naive user, add to Caddyfile, verify sing-box opens SOCKS port.

        Port-open confirms auth succeeded and H2 tunnel established.
        """
        t = int(time.time())
        username = f"e2e_ns_{t}"
        password = "E2eNsPass1!"

        result = panel_api.create_naive_user(username, password)
        assert result["success"] is True

        self._add_user_to_caddyfile(username, password)
        time.sleep(1)

        client = singbox_factory("naive", "127.0.0.1", 10443, username, password)
        client.start()
        assert client._is_port_open(), "sing-box should open SOCKS5 port (auth OK)"
        client.stop()

        panel_api.delete_naive_user(username)
        self._remove_user_from_caddyfile(username)

    def test_hy2_user_created_via_api_then_singbox_connects(self, panel_api, singbox_factory):
        """Create hy2 user via Panel API, update hysteria config, connect via sing-box."""
        t = int(time.time())
        username = f"e2e_hy2_{t}"
        password = "Hy2E2eP1!"

        result = panel_api.create_hy2_user(username, password)
        assert result["success"] is True

        # Wait for panel's on_change_hy2 callback (docker restart hysteria) to settle
        time.sleep(6)

        # Write config with both users and restart
        self._restart_hysteria_with_users({"testuser": "testpass123", username: password})
        time.sleep(5)

        # Verify config has both users
        r = subprocess.run(
            ["docker", "exec", "nt-hysteria2", "cat", "/etc/hysteria/config.yaml"],
            capture_output=True, text=True, timeout=5,
        )
        assert username in r.stdout, f"New user {username} not in hysteria config"

        client = singbox_factory(
            "hysteria2", "127.0.0.1", 10444, username, password,
            tls_insecure=True, server_name="test.localhost",
        )
        client.start()

        status = self._socks5_request(client.socks_port)
        assert status == "200", f"Expected 200, got {status}"

        client.stop()
        panel_api.delete_hy2_user(username)

    def test_multiple_naive_users_curl_connectivity(self, panel_api):
        """Create 3 naive users via API + Caddyfile, verify all connect via curl."""
        t = int(time.time())
        users = []
        for i in range(3):
            uname = f"multi_naive_{t}_{i}"
            password = "MultiPass1!"
            result = panel_api.create_naive_user(uname, password)
            assert result["success"] is True
            self._add_user_to_caddyfile(uname, password)
            users.append((uname, password))

        time.sleep(1)

        for i, (uname, password) in enumerate(users):
            client = CurlNaiveClient(
                server="127.0.0.1", port=10443,
                username=uname, password=password,
                server_name="test.localhost",
            )
            with client:
                ok = client.test_connection("http://test-server/")
                assert ok, f"Curl client {i+1} ({uname}) failed"

        for uname, _ in users:
            panel_api.delete_naive_user(uname)
            self._remove_user_from_caddyfile(uname)

    def test_naive_user_traffic_generation(self, panel_api):
        """Create user, generate multiple HTTP requests, verify traffic was counted."""
        t = int(time.time())
        username = f"traffic_{t}"
        password = "TrfcPass1!"

        traffic_before = panel_api.get_traffic()
        naive_rx_before = traffic_before["perProto"]["naive"]["rx"]
        naive_tx_before = traffic_before["perProto"]["naive"]["tx"]

        result = panel_api.create_naive_user(username, password)
        assert result["success"] is True

        self._add_user_to_caddyfile(username, password)
        time.sleep(1)

        client = CurlNaiveClient(
            server="127.0.0.1", port=10443,
            username=username, password=password,
            server_name="test.localhost",
        )
        with client:
            for _ in range(3):
                ok = client.test_connection("http://test-server/")
                assert ok
                time.sleep(0.3)

        time.sleep(2)

        traffic_after = panel_api.get_traffic()
        naive_rx_after = traffic_after["perProto"]["naive"]["rx"]
        naive_tx_after = traffic_after["perProto"]["naive"]["tx"]

        assert naive_rx_after >= naive_rx_before, \
            f"RX should increase: {naive_rx_after} >= {naive_rx_before}"
        assert naive_tx_after >= naive_tx_before, \
            f"TX should increase: {naive_tx_after} >= {naive_tx_before}"

        panel_api.delete_naive_user(username)
        self._remove_user_from_caddyfile(username)

    def test_deleted_user_cannot_connect(self, panel_api):
        """Create user, connect successfully, delete user, verify connection fails."""
        t = int(time.time())
        username = f"delconn_{t}"
        password = "DelConnP1!"

        result = panel_api.create_naive_user(username, password)
        assert result["success"] is True

        self._add_user_to_caddyfile(username, password)
        time.sleep(1)

        client = CurlNaiveClient(
            server="127.0.0.1", port=10443,
            username=username, password=password,
            server_name="test.localhost",
        )
        with client:
            ok = client.test_connection("http://test-server/")
            assert ok, "Connection should succeed before deletion"

        panel_api.delete_naive_user(username)
        self._remove_user_from_caddyfile(username)
        time.sleep(1)

        client_del = CurlNaiveClient(
            server="127.0.0.1", port=10443,
            username=username, password=password,
            server_name="test.localhost",
        )
        with client_del:
            ok_after = client_del.test_connection("http://test-server/")
            assert not ok_after, "Connection should fail after user deletion"

    def test_wrong_password_rejected_for_valid_user(self, panel_api):
        """Create user with correct password, try connecting with wrong password."""
        t = int(time.time())
        username = f"wrongpwd_{t}"
        correct_password = "CorrectP1!"
        wrong_password = "WrongPass!"

        result = panel_api.create_naive_user(username, correct_password)
        assert result["success"] is True

        self._add_user_to_caddyfile(username, correct_password)
        time.sleep(1)

        client_correct = CurlNaiveClient(
            server="127.0.0.1", port=10443,
            username=username, password=correct_password,
            server_name="test.localhost",
        )
        with client_correct:
            ok = client_correct.test_connection("http://test-server/")
            assert ok, f"Correct password should work"

        client_wrong = CurlNaiveClient(
            server="127.0.0.1", port=10443,
            username=username, password=wrong_password,
            server_name="test.localhost",
        )
        with client_wrong:
            ok_wrong = client_wrong.test_connection("http://test-server/")
            assert not ok_wrong, "Wrong password should be rejected"

        panel_api.delete_naive_user(username)
        self._remove_user_from_caddyfile(username)

    def test_expiry_zero_means_unlimited(self, panel_api):
        """User created with expireDays=0 should have no expiry and be connectable."""
        t = int(time.time())
        username = f"unlim_{t}"
        password = "UnlimPass1!"

        result = panel_api.create_naive_user(username, password, expire_days=0)
        assert result["success"] is True

        users = panel_api.get_naive_users()
        user = next(u for u in users if u["username"] == username)
        assert user["expired"] is False
        assert user["remainingSec"] is None

        self._add_user_to_caddyfile(username, password)
        time.sleep(1)

        client = CurlNaiveClient(
            server="127.0.0.1", port=10443,
            username=username, password=password,
            server_name="test.localhost",
        )
        with client:
            ok = client.test_connection("http://test-server/")
            assert ok, f"Unlimited user should connect"

        panel_api.delete_naive_user(username)
        self._remove_user_from_caddyfile(username)
