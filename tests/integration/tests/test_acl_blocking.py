"""Integration tests for ACL domain blocking via proxy."""

import subprocess
import time

import pytest


NAIVE_PORT = 10443
NAIVE_SERVER_NAME = "test.localhost"
NAIVE_PROXY_URL = f"https://testuser:testpass123@{NAIVE_SERVER_NAME}:{NAIVE_PORT}"
TARGET_URL = "http://test-server/"


def _make_proxy_request(target=TARGET_URL, timeout=15):
    """Make a proxied request through naive and return (http_code, stderr)."""
    result = subprocess.run(
        [
            "curl", "-sk", "--connect-timeout", "5",
            "--proxy-insecure", "--proxy", NAIVE_PROXY_URL,
            "-p", "--proxytunnel",
            target, "-o", "/dev/null", "-w", "%{http_code}", "-s",
        ],
        capture_output=True, text=True, timeout=timeout,
    )
    return result.stdout.strip(), result.stderr.strip()


def _is_proxy_allowed(target=TARGET_URL, timeout=10):
    """Return True if the proxy allows access to the given target."""
    code, _ = _make_proxy_request(target, timeout)
    return code in ("200", "301", "302")


def _reload_caddy():
    """Reload Caddy config to pick up ACL changes."""
    subprocess.run(
        ["docker", "exec", "nt-caddy-naive", "caddy", "reload",
         "--config", "/etc/caddy/Caddyfile"],
        capture_output=True, timeout=10,
    )


class TestAclBlocking:
    """Integration tests for ACL domain/site blocking via proxy."""

    def test_acl_api_returns_config(self, panel_api):
        """GET /api/acl returns ACL config structure with expected fields."""
        resp = panel_api.raw_request("GET", "/api/acl")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()

        for field in ("enabled", "blockDomains", "blockGeosite",
                       "blockGeoip", "directAll", "updatedAt"):
            assert field in data, f"Missing field: {field}"

        assert isinstance(data["enabled"], bool), "enabled must be bool"
        assert isinstance(data["blockDomains"], list), "blockDomains must be list"
        assert isinstance(data["blockGeosite"], list), "blockGeosite must be list"
        assert isinstance(data["blockGeoip"], list), "blockGeoip must be list"
        assert isinstance(data["directAll"], bool), "directAll must be bool"
        assert "bypassCidrs" in data
        assert isinstance(data["bypassCidrs"], list)
        assert "geoSetsExist" in data

    def test_acl_geosite_list(self, panel_api):
        """GET /api/acl/geosite-list returns available categories."""
        resp = panel_api.raw_request("GET", "/api/acl/geosite-list")
        assert resp.status_code == 200
        data = resp.json()
        assert "categories" in data
        assert isinstance(data["categories"], list)
        assert len(data["categories"]) > 0
        # Known geosite categories that should exist
        known = {"netflix", "youtube", "google", "telegram", "twitter", "facebook"}
        found = set(data["categories"])
        assert known & found, f"Expected some of {known} in categories: {found}"

    def test_acl_geoip_list(self, panel_api):
        """GET /api/acl/geoip-list returns available countries."""
        resp = panel_api.raw_request("GET", "/api/acl/geoip-list")
        assert resp.status_code == 200
        data = resp.json()
        assert "countries" in data
        assert isinstance(data["countries"], list)
        assert len(data["countries"]) > 0
        known = {"cn", "ru", "ir", "us"}
        found = set(data["countries"])
        assert known & found, f"Expected some of {known} in countries: {found}"

    @pytest.mark.skip(reason="ACL Caddyfile update requires installed=true (panel doesn't write Caddyfile in TEST_MODE)")
    def test_acl_block_domain_via_naive(self, panel_api):
        """Block a domain via ACL, verify proxy rejects it."""
        # 1. Save original ACL config
        orig_resp = panel_api.raw_request("GET", "/api/acl")
        assert orig_resp.status_code == 200
        original = orig_resp.json()

        try:
            # 2. Set ACL to block test-server
            put_resp = panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": True,
                    "blockDomains": ["test-server"],
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": False,
                },
            )
            assert put_resp.status_code == 200, f"PUT /api/acl failed: {put_resp.text}"
            assert put_resp.json().get("success") is True

            # 3. Reload Caddy to apply ACL
            _reload_caddy()
            time.sleep(2)

            # 4. Verify test-server is blocked
            allowed = _is_proxy_allowed()
            assert not allowed, (
                "Expected test-server to be blocked by ACL, but proxy allowed it"
            )

        finally:
            # 5. Restore original ACL
            panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": original.get("enabled", False),
                    "blockDomains": original.get("blockDomains", []),
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": original.get("directAll", False),
                },
            )
            _reload_caddy()
            time.sleep(2)

    def test_acl_unblocked_domain_works(self, panel_api):
        """Unblocked domains still work through proxy when others are blocked."""
        orig_resp = panel_api.raw_request("GET", "/api/acl")
        assert orig_resp.status_code == 200
        original = orig_resp.json()

        try:
            # Block a domain that is NOT test-server
            put_resp = panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": True,
                    "blockDomains": ["blocked.example.com"],
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": False,
                },
            )
            assert put_resp.status_code == 200
            assert put_resp.json().get("success") is True

            _reload_caddy()
            time.sleep(2)

            # test-server should still be accessible
            allowed = _is_proxy_allowed()
            assert allowed, (
                "test-server should still be accessible when not in block list"
            )

        finally:
            panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": original.get("enabled", False),
                    "blockDomains": original.get("blockDomains", []),
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": original.get("directAll", False),
                },
            )
            _reload_caddy()
            time.sleep(2)

    def test_acl_direct_all_bypasses_acl(self, panel_api):
        """directAll=true should bypass all blocking."""
        orig_resp = panel_api.raw_request("GET", "/api/acl")
        assert orig_resp.status_code == 200
        original = orig_resp.json()

        try:
            # Block test-server but set directAll=true
            put_resp = panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": True,
                    "blockDomains": ["test-server"],
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": True,
                },
            )
            assert put_resp.status_code == 200
            assert put_resp.json().get("success") is True

            _reload_caddy()
            time.sleep(2)

            # test-server should still be accessible because directAll bypasses
            allowed = _is_proxy_allowed()
            assert allowed, (
                "test-server should be accessible when directAll=True even if blocked"
            )

        finally:
            panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": original.get("enabled", False),
                    "blockDomains": original.get("blockDomains", []),
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": original.get("directAll", False),
                },
            )
            _reload_caddy()
            time.sleep(2)

    def test_acl_empty_blocks_allow_all(self, panel_api):
        """Empty block lists should allow all traffic."""
        orig_resp = panel_api.raw_request("GET", "/api/acl")
        assert orig_resp.status_code == 200
        original = orig_resp.json()

        try:
            # Enable ACL with empty block lists
            put_resp = panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": True,
                    "blockDomains": [],
                    "blockGeosite": [],
                    "blockGeoip": [],
                    "directAll": False,
                },
            )
            assert put_resp.status_code == 200
            assert put_resp.json().get("success") is True

            _reload_caddy()
            time.sleep(2)

            # test-server should still be accessible
            allowed = _is_proxy_allowed()
            assert allowed, (
                "test-server should be accessible with empty block lists"
            )

        finally:
            panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": original.get("enabled", False),
                    "blockDomains": original.get("blockDomains", []),
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": original.get("directAll", False),
                },
            )
            _reload_caddy()
            time.sleep(2)

    def test_acl_disabled_allows_all(self, panel_api):
        """When ACL is disabled, blocked domains should still be accessible."""
        orig_resp = panel_api.raw_request("GET", "/api/acl")
        assert orig_resp.status_code == 200
        original = orig_resp.json()

        try:
            # Block test-server but disable ACL
            put_resp = panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": False,
                    "blockDomains": ["test-server"],
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": False,
                },
            )
            assert put_resp.status_code == 200
            assert put_resp.json().get("success") is True

            _reload_caddy()
            time.sleep(2)

            # test-server should be accessible since ACL is disabled
            allowed = _is_proxy_allowed()
            assert allowed, (
                "test-server should be accessible when ACL is disabled"
            )

        finally:
            panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": original.get("enabled", False),
                    "blockDomains": original.get("blockDomains", []),
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": original.get("directAll", False),
                },
            )
            _reload_caddy()
            time.sleep(2)

    def test_acl_put_returns_updated_config(self, panel_api):
        """PUT /api/acl returns the updated ACL config in response."""
        orig_resp = panel_api.raw_request("GET", "/api/acl")
        assert orig_resp.status_code == 200
        original = orig_resp.json()

        try:
            put_resp = panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": True,
                    "blockDomains": ["test-update.example.com"],
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": False,
                },
            )
            assert put_resp.status_code == 200
            data = put_resp.json()
            assert data.get("success") is True
            assert "test-update.example.com" in data.get("blockDomains", [])
            assert data.get("enabled") is True
            assert data.get("directAll") is False
            assert "updatedAt" in data

            # Verify GET reflects the change
            get_resp = panel_api.raw_request("GET", "/api/acl")
            assert get_resp.status_code == 200
            assert "test-update.example.com" in get_resp.json().get("blockDomains", [])

        finally:
            panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": original.get("enabled", False),
                    "blockDomains": original.get("blockDomains", []),
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": original.get("directAll", False),
                },
            )
            _reload_caddy()
            time.sleep(2)

    def test_acl_geosite_list_returns_valid_format(self, panel_api):
        """GET /api/acl/geosite-list returns a well-formed categories array."""
        resp = panel_api.raw_request("GET", "/api/acl/geosite-list")
        assert resp.status_code == 200
        data = resp.json()
        cats = data["categories"]
        assert all(isinstance(c, str) for c in cats), "All categories must be strings"
        assert len(cats) == len(set(cats)), "Categories must be unique"
        # Verify common categories exist
        assert "netflix" in cats, "netflix category should exist"
        assert "google" in cats, "google category should exist"

    def test_acl_geoip_list_returns_valid_format(self, panel_api):
        """GET /api/acl/geoip-list returns a well-formed countries array."""
        resp = panel_api.raw_request("GET", "/api/acl/geoip-list")
        assert resp.status_code == 200
        data = resp.json()
        countries = data["countries"]
        assert all(isinstance(c, str) for c in countries), "All countries must be strings"
        assert len(countries) == len(set(countries)), "Countries must be unique"
        assert all(len(c) == 2 for c in countries), "Country codes must be 2 chars"
        assert "cn" in countries, "cn country code should exist"
        assert "ru" in countries, "ru country code should exist"

    def test_acl_domain_normalization_on_put(self, panel_api):
        """Domains with http://, www., and trailing slashes are normalized."""
        orig_resp = panel_api.raw_request("GET", "/api/acl")
        assert orig_resp.status_code == 200
        original = orig_resp.json()

        try:
            put_resp = panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": True,
                    "blockDomains": [
                        "http://www.example.com/",
                        "https://TEST.ORG/path?query=1",
                        "  spaced.example.com  ",
                    ],
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": False,
                },
            )
            assert put_resp.status_code == 200
            data = put_resp.json()
            domains = data.get("blockDomains", [])

            assert "example.com" in domains, (
                f"http://www.example.com/ should normalize to example.com, got {domains}"
            )
            assert "test.org" in domains, (
                f"https://TEST.ORG/path?query=1 should normalize to test.org, got {domains}"
            )
            assert "spaced.example.com" in domains, (
                f"spaced should be trimmed, got {domains}"
            )

            # Verify no raw URLs remain
            for d in domains:
                assert "://" not in d, f"Domain '{d}' still contains protocol"
                assert "/" not in d, f"Domain '{d}' still contains path"
                assert d == d.strip(), f"Domain '{d}' has whitespace"

        finally:
            panel_api.raw_request(
                "PUT", "/api/acl",
                json={
                    "enabled": original.get("enabled", False),
                    "blockDomains": original.get("blockDomains", []),
                    "blockGeosite": original.get("blockGeosite", []),
                    "blockGeoip": original.get("blockGeoip", []),
                    "directAll": original.get("directAll", False),
                },
            )
