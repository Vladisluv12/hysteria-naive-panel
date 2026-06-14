import subprocess
import time
import pytest
from helpers.curl_naive_client import CurlNaiveClient


class TestNaiveConnectivity:
    """Integration tests for Naive proxy via Caddy."""

    def test_naive_tcp_connectivity(self):
        """Verify TCP proxy works through Naive/Caddy."""
        client = CurlNaiveClient(
            server="127.0.0.1",
            port=10443,
            username="testuser",
            password="testpass123",
            server_name="test.localhost",
        )
        with client:
            result = client.test_connection("http://test-server/")
            assert result, "Naive TCP proxy connection failed"

    def test_naive_auth_rejection(self):
        """Verify wrong credentials are rejected."""
        client = CurlNaiveClient(
            server="127.0.0.1",
            port=10443,
            username="wronguser",
            password="wrongpass",
            server_name="test.localhost",
        )
        with client:
            result = client.test_connection("http://test-server/")
            assert not result, "Naive should reject wrong credentials"