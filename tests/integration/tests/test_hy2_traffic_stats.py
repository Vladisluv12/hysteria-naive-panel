"""Integration tests for Hysteria2 per-user traffic via Traffic Stats API.

Verifies:
- Hysteria2 traffic stats API (:9999) is running and returns JSON
- Per-user traffic counting works after proxy connections (raw API)
- Panel /api/traffic endpoint includes perUser.hy2 key in response
"""

import json
import subprocess
import time

import pytest


class TestHy2TrafficStats:
    """Integration tests for Hysteria2 per-user traffic via Traffic Stats API."""

    TRAFFIC_API_BASE = "http://127.0.0.1:9999"
    SEED_USER = "testuser"
    SEED_PASS = "testpass123"

    # ── helpers ──────────────────────────────────────────────────────────

    def _query_traffic_api(self):
        """Query Hysteria2 traffic API directly via docker exec. Returns dict or None."""
        result = subprocess.run(
            ["docker", "exec", "nt-hysteria2", "wget", "-qO-",
             f"{self.TRAFFIC_API_BASE}/traffic"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return None
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return None

    def _query_online_api(self):
        """Query Hysteria2 online API directly via docker exec. Returns dict or None."""
        result = subprocess.run(
            ["docker", "exec", "nt-hysteria2", "wget", "-qO-",
             f"{self.TRAFFIC_API_BASE}/online"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return None
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return None

    def _restore_seed_config(self):
        """Restart hysteria container to restore seed config with trafficStats."""
        subprocess.run(
            ["docker", "restart", "nt-hysteria2"],
            capture_output=True, timeout=30,
        )
        time.sleep(3)

    # ── tests ───────────────────────────────────────────────────────────

    def test_hy2_traffic_api_accessible(self, docker_services):
        """Verify hysteria2 traffic stats API is running on :9999."""
        self._restore_seed_config()

        result = subprocess.run(
            ["docker", "exec", "nt-hysteria2", "wget", "-qO-",
             f"{self.TRAFFIC_API_BASE}/traffic"],
            capture_output=True, text=True, timeout=10,
        )
        assert result.returncode == 0, (
            f"Traffic API unreachable: {result.stderr}"
        )
        data = json.loads(result.stdout)
        assert isinstance(data, dict), (
            f"Traffic API should return JSON object, got: {result.stdout[:100]}"
        )

        online_result = subprocess.run(
            ["docker", "exec", "nt-hysteria2", "wget", "-qO-",
             f"{self.TRAFFIC_API_BASE}/online"],
            capture_output=True, text=True, timeout=10,
        )
        assert online_result.returncode == 0, (
            f"Online API unreachable: {online_result.stderr}"
        )
        online_data = json.loads(online_result.stdout)
        assert isinstance(online_data, dict), (
            f"Online API should return JSON object, got: {online_result.stdout[:100]}"
        )

    def test_hy2_traffic_counts_after_connection(self, panel_api, singbox_factory):
        """Connect via sing-box with seed user, verify raw traffic API reports rx/tx > 0."""
        self._restore_seed_config()

        baseline = self._query_traffic_api()
        assert baseline is not None, "Failed to query raw traffic API for baseline"

        client = singbox_factory(
            proxy_type="hysteria2",
            server="127.0.0.1",
            port=10444,
            username=self.SEED_USER,
            password=self.SEED_PASS,
            socks_port=10830,
            tls_insecure=True,
            server_name="test.localhost",
        )
        with client:
            for _ in range(20):
                if client._is_port_open():
                    break
                time.sleep(0.5)
            assert client._is_port_open(), "sing-box did not open socks port"

            for _ in range(3):
                subprocess.run(
                    ["curl", "-sk", "--socks5-hostname",
                     f"127.0.0.1:{client.socks_port}",
                     "http://test-server/", "-o", "/dev/null"],
                    capture_output=True, timeout=10,
                )
                time.sleep(0.3)

            time.sleep(2)

        after = self._query_traffic_api()
        assert after is not None, "Failed to query raw traffic API after connections"

        assert self.SEED_USER in after, (
            f"{self.SEED_USER} not found in traffic data: {list(after.keys())}"
        )
        user_stats = after[self.SEED_USER]
        assert user_stats["rx"] > 0, (
            f"rx should be > 0 for {self.SEED_USER}, got {user_stats['rx']}"
        )
        assert user_stats["tx"] > 0, (
            f"tx should be > 0 for {self.SEED_USER}, got {user_stats['tx']}"
        )

        panel_traffic = panel_api.get_traffic()
        assert "perUser" in panel_traffic, "Missing perUser in panel /api/traffic"
        assert "hy2" in panel_traffic["perUser"], "Missing hy2 in panel perUser"
        assert isinstance(panel_traffic["perUser"]["hy2"], dict), (
            "perUser.hy2 should be a dict"
        )

    def test_hy2_traffic_empty_when_no_connections(self, panel_api):
        """Verify perUser.hy2 is present in panel API when idle, raw API returns valid JSON."""
        self._restore_seed_config()

        traffic_data = self._query_traffic_api()
        assert traffic_data is not None, "Raw traffic API unreachable"
        assert isinstance(traffic_data, dict), "Raw traffic data should be a dict"

        panel_traffic = panel_api.get_traffic()
        assert "perUser" in panel_traffic, "Missing perUser in /api/traffic"
        assert "hy2" in panel_traffic["perUser"], "Missing hy2 in perUser"

        hy2 = panel_traffic["perUser"]["hy2"]
        assert isinstance(hy2, dict), "perUser.hy2 should be a dict"
        assert "users" in hy2, "Missing users key in perUser.hy2"
        assert isinstance(hy2["users"], dict), "hy2.users should be a dict"
        assert "updated_at" in hy2, "Missing updated_at key in perUser.hy2"

    def test_panel_traffic_endpoint_has_peruser_structure(self, panel_api):
        """Verify GET /api/traffic returns perUser with both naive and hy2 keys."""
        traffic = panel_api.get_traffic()

        assert "perUser" in traffic, "Missing perUser key in /api/traffic response"

        per_user = traffic["perUser"]
        assert "naive" in per_user, "Missing naive key in perUser"
        assert "hy2" in per_user, "Missing hy2 key in perUser"

        naive = per_user["naive"]
        assert isinstance(naive, dict), "perUser.naive should be a dict"
        assert "users" in naive, "Missing users key in perUser.naive"
        assert isinstance(naive["users"], dict), "naive.users should be a dict"
        assert "updated_at" in naive, "Missing updated_at in perUser.naive"

        hy2 = per_user["hy2"]
        assert isinstance(hy2, dict), "perUser.hy2 should be a dict"
        assert "users" in hy2, "Missing users key in perUser.hy2"
        assert isinstance(hy2["users"], dict), "hy2.users should be a dict"
        assert "updated_at" in hy2, "Missing updated_at in perUser.hy2"
