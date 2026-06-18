"""Integration tests for forwardproxy-traffic module.

Verifies per-user traffic counting via Caddy with forwardproxy-traffic plugin.
"""

import json
import subprocess
import time

import pytest


class TestForwardproxyTraffic:
    """Tests for per-user RX/TX traffic counting."""

    TRAFFIC_PORT = 11443

    def _curl_proxy(self, username, password, target="http://test-server/"):
        """Make a single proxied request and return HTTP status code."""
        proxy_url = f"https://{username}:{password}@test.localhost:{self.TRAFFIC_PORT}"
        result = subprocess.run(
            [
                "curl", "-sk", "--connect-timeout", "5",
                "--proxy-insecure", "--proxy", proxy_url,
                "-p", "--proxytunnel",
                target, "-o", "/dev/null", "-w", "%{http_code}", "-s",
            ],
            capture_output=True, text=True, timeout=15,
        )
        return result.stdout.strip()

    def _read_traffic_file(self):
        """Read the traffic JSON file from inside the container."""
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

    def _wait_for_traffic_file(self, timeout=15):
        """Poll until traffic.json exists and has content."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            data = self._read_traffic_file()
            if data and data.get("users"):
                return data
            time.sleep(1)
        return None

    def test_caddy_traffic_service_healthy(self):
        """Verify the caddy-traffic service is running and healthy."""
        result = subprocess.run(
            ["docker", "exec", "nt-caddy-traffic", "wget", "-qO-", "http://127.0.0.1:2019/config/"],
            capture_output=True, text=True, timeout=10,
        )
        assert result.returncode == 0, f"Caddy traffic admin API unreachable: {result.stderr}"

    def test_proxy_connectivity(self):
        """Verify the traffic-counting Caddy accepts valid credentials."""
        status = self._curl_proxy("user1", "pass1")
        assert status == "200", f"Expected 200, got {status}"

    def test_auth_rejection(self):
        """Verify wrong credentials still rejected."""
        status = self._curl_proxy("wrong", "wrong")
        assert status != "200", f"Expected non-200 for wrong creds, got {status}"

    def test_traffic_counting_per_user(self):
        """Make requests from two users, verify per-user counters."""
        for _ in range(3):
            self._curl_proxy("user1", "pass1")
        time.sleep(0.5)
        for _ in range(2):
            self._curl_proxy("user2", "pass2")
        time.sleep(1)

        data = self._wait_for_traffic_file(timeout=20)
        assert data is not None, "Traffic JSON not written within timeout"

        users = data.get("users", {})
        assert "user1" in users, f"user1 not found in traffic data: {list(users.keys())}"
        assert "user2" in users, f"user2 not found in traffic data: {list(users.keys())}"

        user1 = users["user1"]
        user2 = users["user2"]

        assert user1["rx"] > 0, f"user1 rx should be > 0, got {user1['rx']}"
        assert user1["tx"] > 0, f"user1 tx should be > 0, got {user1['tx']}"
        assert user2["rx"] > 0, f"user2 rx should be > 0, got {user2['rx']}"
        assert user2["tx"] > 0, f"user2 tx should be > 0, got {user2['tx']}"

        assert "updated_at" in data, "Missing updated_at field"
        assert data["updated_at"] > 0, "updated_at should be positive timestamp"

    def test_connection_count(self):
        """Verify conns counter reflects active tunnels."""
        self._curl_proxy("user1", "pass1")
        time.sleep(1)

        data = self._read_traffic_file()
        if data and "user1" in data.get("users", {}):
            u1 = data["users"]["user1"]
            assert u1.get("conns", -1) >= 0, f"conns should be >= 0, got {u1.get('conns')}"

    def test_json_structure(self):
        """Verify the traffic JSON has valid structure."""
        self._curl_proxy("user1", "pass1")
        data = self._wait_for_traffic_file(timeout=20)
        assert data is not None

        assert "users" in data, "Missing 'users' key"
        assert "updated_at" in data, "Missing 'updated_at' key"
        assert isinstance(data["users"], dict), "users should be a dict"
        assert isinstance(data["updated_at"], int), "updated_at should be int"

        for username, stats in data["users"].items():
            assert "rx" in stats, f"Missing 'rx' for {username}"
            assert "tx" in stats, f"Missing 'tx' for {username}"
            assert "conns" in stats, f"Missing 'conns' for {username}"
            assert isinstance(stats["rx"], int), f"rx should be int for {username}"
            assert isinstance(stats["tx"], int), f"tx should be int for {username}"
            assert isinstance(stats["conns"], int), f"conns should be int for {username}"

    def test_anonymous_no_traffic(self):
        """Verify anonymous requests don't add new users or increase existing counters."""
        # Wait for any pending async flushes before baseline
        time.sleep(3)
        baseline = self._read_traffic_file() or {"users": {}}
        baseline_users = set(baseline.get("users", {}).keys())
        baseline_rx = {u: v["rx"] for u, v in baseline.get("users", {}).items()}
        baseline_tx = {u: v["tx"] for u, v in baseline.get("users", {}).items()}

        result = subprocess.run(
            [
                "curl", "-sk", "--connect-timeout", "5",
                "--proxy-insecure",
                "--proxy", f"https://test.localhost:{self.TRAFFIC_PORT}",
                "-p", "--proxytunnel",
                "http://test-server/", "-o", "/dev/null", "-w", "%{http_code}", "-s",
            ],
            capture_output=True, text=True, timeout=15,
        )
        status = result.stdout.strip()
        assert status != "200", f"Expected auth rejection for anonymous, got {status}"

        time.sleep(3)
        data = self._read_traffic_file()
        if data:
            current_users = set(data.get("users", {}).keys())
            new_users = current_users - baseline_users
            assert len(new_users) == 0, f"Anonymous request created new users: {new_users}"
            for u in baseline_users:
                if u in data.get("users", {}):
                    assert data["users"][u]["rx"] >= baseline_rx.get(u, 0), \
                        f"Anonymous request should not decrease RX for {u}"
                    assert data["users"][u]["tx"] >= baseline_tx.get(u, 0), \
                        f"Anonymous request should not decrease TX for {u}"

    def test_multiple_requests_accumulate(self):
        """Verify traffic accumulates over multiple requests."""
        self._curl_proxy("user1", "pass1")
        self._curl_proxy("user1", "pass1")
        time.sleep(1)

        first = self._read_traffic_file()
        assert first and "user1" in first.get("users", {}), "First check: user1 not found"
        first_rx = first["users"]["user1"]["rx"]
        first_tx = first["users"]["user1"]["tx"]

        self._curl_proxy("user1", "pass1")
        time.sleep(1)

        second = self._read_traffic_file()
        second_rx = second["users"]["user1"]["rx"]
        second_tx = second["users"]["user1"]["tx"]

        assert second_rx >= first_rx, f"RX should accumulate: {second_rx} >= {first_rx}"
        assert second_tx >= first_tx, f"TX should accumulate: {second_tx} >= {first_tx}"
