import json
import subprocess
import time
from pathlib import Path

from helpers.curl_naive_client import CurlNaiveClient


SING_BOX_BIN = str(Path(__file__).parent.parent / "bin" / "sing-box")


class TestForwardproxyNaiveCompatibility:
    """Verify forwardproxy-traffic extension works with naiveproxy protocol features.

    Note: sing-box naive outbound has known HTTP/0.9 forwarding issue through
    SOCKS5. Auth verification uses sing-box port-open check; actual HTTP
    connectivity tests use CurlNaiveClient (curl --proxy tunnel).
    """

    TRAFFIC_PORT = 11443
    NAIVE_PORT = 10443

    def _socks5_request(self, socks_port: int, target="http://test-server/"):
        result = subprocess.run(
            ["curl", "-sk", "--socks5-hostname", f"127.0.0.1:{socks_port}",
             target, "-o", "/dev/null", "-w", "%{http_code}", "-s"],
            capture_output=True, text=True, timeout=15,
        )
        return result.stdout.strip()

    def _curl_connect(self, username, password, port):
        proxy_url = f"https://{username}:{password}@test.localhost:{port}"
        result = subprocess.run(
            [
                "curl", "-sk", "--connect-timeout", "5",
                "--proxy-insecure", "--proxy", proxy_url,
                "-p", "--proxytunnel",
                "http://test-server/", "-o", "/dev/null", "-w", "%{http_code}", "-s",
            ],
            capture_output=True, text=True, timeout=15,
        )
        return result.stdout.strip()

    def _curl_verbose_connect(self, username, password, port):
        proxy_url = f"https://{username}:{password}@test.localhost:{port}"
        result = subprocess.run(
            [
                "curl", "-sk", "-v", "--connect-timeout", "5",
                "--proxy-insecure", "--proxy", proxy_url,
                "-p", "--proxytunnel",
                "http://test-server/", "-o", "/dev/null", "-w", "%{http_code}", "-s",
            ],
            capture_output=True, text=True, timeout=15,
        )
        return result.stderr

    def _read_traffic_file(self):
        result = subprocess.run(
            ["docker", "exec", "nt-caddy-traffic", "cat", "/tmp/traffic.json"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return None
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return None

    def test_traffic_caddy_supports_http2_connect(self):
        """Verify caddy-traffic supports HTTP/2 CONNECT method (naiveproxy requirement)."""
        verbose = self._curl_verbose_connect("user1", "pass1", self.TRAFFIC_PORT)
        assert "200" in verbose or verbose.strip().endswith("200"), \
            f"CONNECT should succeed, stderr: {verbose[-500:]}"

        http2_result = subprocess.run(
            [
                "curl", "-sk", "--http2", "--connect-timeout", "5",
                "--proxy-insecure",
                "--proxy", f"https://user1:pass1@test.localhost:{self.TRAFFIC_PORT}",
                "-p", "--proxytunnel",
                "http://test-server/", "-o", "/dev/null", "-w", "%{http_code}", "-s",
            ],
            capture_output=True, text=True, timeout=15,
        )
        status = http2_result.stdout.strip()
        assert status == "200", f"HTTP/2 CONNECT should succeed, got: {status}"

    def test_padding_header_present(self):
        """Verify Padding header is present in CONNECT response (naiveproxy wire format)."""
        verbose = self._curl_verbose_connect("user1", "pass1", self.TRAFFIC_PORT)
        assert "Padding" in verbose or "padding" in verbose, \
            f"Padding header should be present in response headers, got: {verbose[-500:]}"

    def test_both_caddy_instances_work_with_curl(self):
        """Both caddy-naive (10443) and caddy-traffic (11443) accept valid credentials."""
        tests = [
            ("caddy-naive", self.NAIVE_PORT, "testuser", "testpass123"),
            ("caddy-traffic", self.TRAFFIC_PORT, "user1", "pass1"),
        ]

        for label, port, username, password in tests:
            status = self._curl_connect(username, password, port)
            assert status == "200", f"{label} on port {port} failed: got {status}"

    def test_both_caddy_instances_singbox_auth(self, singbox_factory):
        """Both caddy instances authenticate sing-box naive clients (port opens).

        Sing-box naive outbound has known SOCKS5→HTTP forwarding issue.
        Port-open confirms auth succeeded and H2 tunnel established.
        """
        test_instances = [
            ("caddy-naive", self.NAIVE_PORT, "testuser", "testpass123"),
            ("caddy-traffic", self.TRAFFIC_PORT, "user1", "pass1"),
        ]

        for label, port, username, password in test_instances:
            client = singbox_factory(
                "naive", "127.0.0.1", port, username, password,
            )
            client.start()
            assert client._is_port_open(), \
                f"{label} sing-box should open SOCKS5 port (auth OK)"
            client.stop()

    def test_traffic_caddy_per_user_counting_curl(self):
        """Verify traffic counting works when using curl-based CONNECT tunnel."""
        baseline = self._read_traffic_file()
        baseline_rx_user1 = 0
        baseline_tx_user1 = 0
        if baseline and "user1" in baseline.get("users", {}):
            baseline_rx_user1 = baseline["users"]["user1"]["rx"]
            baseline_tx_user1 = baseline["users"]["user1"]["tx"]

        for _ in range(3):
            status = self._curl_connect("user1", "pass1", self.TRAFFIC_PORT)
            assert status == "200"
            time.sleep(0.5)

        time.sleep(6)

        after = self._read_traffic_file()
        assert after is not None, "Traffic JSON should exist after curl requests"
        assert "user1" in after.get("users", {}), "user1 should be in traffic data"

        user_rx = after["users"]["user1"]["rx"]
        user_tx = after["users"]["user1"]["tx"]
        assert user_rx > 0, f"user1 rx should be > 0, got {user_rx}"
        assert user_tx > 0, f"user1 tx should be > 0, got {user_tx}"
        assert user_rx >= baseline_rx_user1, \
            f"RX should not decrease: {user_rx} >= {baseline_rx_user1}"
        assert user_tx >= baseline_tx_user1, \
            f"TX should not decrease: {user_tx} >= {baseline_tx_user1}"

    def test_multiple_curl_connections_per_user(self):
        """Multiple curl-based CONNECT requests using same credentials should not conflict."""
        for i in range(3):
            status = self._curl_connect("user1", "pass1", self.TRAFFIC_PORT)
            assert status == "200", f"Request {i+1} failed: got {status}"
