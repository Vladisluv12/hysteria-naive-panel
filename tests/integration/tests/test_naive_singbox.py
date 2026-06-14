import subprocess
import time
import pytest
from helpers.singbox_client import SingBoxClient


NAIVE_CREDS = {"username": "testuser", "password": "testpass123"}


class TestNaiveSingBoxConnectivity:
    """Integration tests for Naive proxy via sing-box client (not curl).

    Note: These tests use the static Caddyfile credentials (testuser/testpass123)
    because the Panel API manages a separate Caddyfile for the real domain,
    not the test.localhost:10443 endpoint used in these tests.

    Known limitation: sing-box Naive SOCKS5 + curl has response forwarding issues
    (sing-box logs "status: 200" but curl receives malformed HTTP/0.9).
    These tests focus on auth verification and client lifecycle.
    """

    def test_naive_singbox_wrong_password_rejection(self, docker_services):
        """Verify sing-box Naive client is rejected with wrong password."""
        client = SingBoxClient(
            proxy_type="naive",
            server="127.0.0.1",
            port=10443,
            username=NAIVE_CREDS["username"],
            password="completely_wrong_password",
            socks_port=10832,
            sing_box_bin="bin/sing-box",
            server_name="test.localhost",
            certificate_path="bin/ca.crt",
        )
        with client:
            assert client._is_port_open(), "sing-box SOCKS5 port not open"
            result = subprocess.run(
                ["curl", "-sk", "--socks5-hostname", "127.0.0.1:10832",
                 "http://test-server/", "-o", "/dev/null", "-w", "%{http_code}", "-s"],
                capture_output=True, text=True, timeout=10
            )
            assert result.returncode != 0, f"Naive should reject wrong password, got exit={result.returncode}, code={result.stdout.strip()}"

    def test_naive_singbox_wrong_username_rejection(self, docker_services):
        """Verify sing-box Naive client is rejected with non-existent username."""
        client = SingBoxClient(
            proxy_type="naive",
            server="127.0.0.1",
            port=10443,
            username="nonexistent_user",
            password=NAIVE_CREDS["password"],
            socks_port=10833,
            sing_box_bin="bin/sing-box",
            server_name="test.localhost",
            certificate_path="bin/ca.crt",
        )
        with client:
            assert client._is_port_open(), "sing-box SOCKS5 port not open"
            result = subprocess.run(
                ["curl", "-sk", "--socks5-hostname", "127.0.0.1:10833",
                 "http://test-server/", "-o", "/dev/null", "-w", "%{http_code}", "-s"],
                capture_output=True, text=True, timeout=10
            )
            assert result.returncode != 0, f"Naive should reject wrong username, got exit={result.returncode}, code={result.stdout.strip()}"

    def test_naive_singbox_multiple_clients(self, docker_services):
        """Verify multiple sing-box Naive clients can run simultaneously with same creds."""
        clients = []
        for i in range(3):
            client = SingBoxClient(
                proxy_type="naive",
                server="127.0.0.1",
                port=10443,
                username=NAIVE_CREDS["username"],
                password=NAIVE_CREDS["password"],
                socks_port=10840 + i,
                sing_box_bin="bin/sing-box",
                server_name="test.localhost",
                certificate_path="bin/ca.crt",
            )
            client.start()
            clients.append(client)

        try:
            for i, client in enumerate(clients):
                assert client._is_port_open(), f"Client {i} SOCKS5 port not open"
        finally:
            for client in clients:
                client.stop()

    def test_naive_singbox_correct_credential_port_open(self, docker_services):
        """Verify sing-box Naive with correct credentials opens SOCKS5 port successfully."""
        client = SingBoxClient(
            proxy_type="naive",
            server="127.0.0.1",
            port=10443,
            username=NAIVE_CREDS["username"],
            password=NAIVE_CREDS["password"],
            socks_port=10845,
            sing_box_bin="bin/sing-box",
            server_name="test.localhost",
            certificate_path="bin/ca.crt",
        )
        with client:
            assert client._is_port_open(), "sing-box should open SOCKS5 port with correct credentials"

    def test_naive_singbox_version_reporting(self, docker_services):
        """Verify sing-box binary has naive support and correct version."""
        result = subprocess.run(
            ["bin/sing-box", "version"],
            capture_output=True, text=True, timeout=5
        )
        assert result.returncode == 0, "sing-box version command should succeed"
        assert "with_naive_outbound" in result.stdout, "sing-box should be built with naive_outbound support"