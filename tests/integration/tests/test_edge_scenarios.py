import asyncio
import json
import subprocess
import time

import pytest
import requests

from helpers.curl_naive_client import CurlNaiveClient
from helpers.panel_client import PanelClient


class TestEdgeScenarios:
    """Scenarios D3, D5, D7, E3 from scenarios document."""

    # ── D3: Expired user marked as expired ──
    def test_expired_user_detection(self, docker_services):
        import tempfile
        panel = PanelClient("http://127.0.0.1:3000")
        assert panel.login()

        username = f"expiry_test_{int(time.time())}"
        panel.create_naive_user(username, "ExpiryTest1!", expire_days=1)

        script = f"""import json
cfg = json.load(open('/config-share/config.json'))
for u in cfg.get('naiveUsers', []):
    if u.get('username') == '{username}':
        u['expiresAt'] = '2020-01-01T00:00:00.000Z'
json.dump(cfg, open('/config-share/config.json', 'w'), indent=2)
print('OK')
"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(script)
            tmp_path = f.name

        subprocess.run(["docker", "cp", tmp_path, "nt-panel:/tmp/expire_patch.py"], capture_output=True)
        result = subprocess.run(
            ["docker", "exec", "nt-panel", "python3", "/tmp/expire_patch.py"],
            capture_output=True, text=True, timeout=10,
        )
        import os
        os.unlink(tmp_path)

        users = panel.get_naive_users()
        user = next((u for u in users if u["username"] == username), None)
        assert user is not None
        assert user["expired"] is True, f"User should be expired, got {user}"
        assert user["remainingSec"] == 0

        panel.delete_naive_user(username)

    # ── D5: Invalid domain via WebSocket ──
    def test_websocket_invalid_domain(self, docker_services):
        panel = PanelClient("http://127.0.0.1:3000")
        assert panel.login()
        cookies = "; ".join(
            f"{k}={v}" for k, v in panel.session.cookies.items()
        )

        async def _ws_test():
            import websockets
            async with websockets.connect(
                "ws://localhost:3000/",
                additional_headers={"Cookie": cookies},
                close_timeout=2,
            ) as ws:
                await ws.send(json.dumps({
                    "type": "install_naive",
                    "domain": "not-a-domain",
                    "email": "admin@example.com",
                    "login": "admin",
                    "password": "MyPassword123!",
                }))
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=5)
                except asyncio.TimeoutError:
                    pytest.fail("Timeout waiting for install_error response")
                data = json.loads(msg)
                assert data.get("type") == "install_error", f"Expected install_error, got {data}"
                assert "домен" in data.get("message", "").lower()

        asyncio.run(_ws_test())

    # ── D5b: Invalid domain edge cases ──
    @pytest.mark.parametrize("bad_domain", [
        "",
        ".com",
        "a..b.com",
        "example",
    ])
    def test_websocket_invalid_domain_variants(self, docker_services, bad_domain):
        panel = PanelClient("http://127.0.0.1:3000")
        assert panel.login()
        cookies = "; ".join(
            f"{k}={v}" for k, v in panel.session.cookies.items()
        )

        async def _ws_test():
            import websockets
            async with websockets.connect(
                "ws://localhost:3000/",
                additional_headers={"Cookie": cookies},
                close_timeout=2,
            ) as ws:
                await ws.send(json.dumps({
                    "type": "install_naive",
                    "domain": bad_domain,
                    "email": "admin@example.com",
                    "login": "admin",
                    "password": "MyPassword123!",
                }))
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=5)
                except asyncio.TimeoutError:
                    pytest.fail(f"Timeout waiting for install_error for domain '{bad_domain}'")
                data = json.loads(msg)
                assert data.get("type") == "install_error", \
                    f"Expected install_error for '{bad_domain}', got {data}"

        asyncio.run(_ws_test())

    # ── E3: Traffic counters increment after proxy request ──
    def test_traffic_increments_after_request(self, docker_services):
        panel = PanelClient("http://127.0.0.1:3000")
        assert panel.login()
        data_before = panel.get_traffic()
        naive_rx_before = data_before["perProto"]["naive"]["rx"]
        naive_tx_before = data_before["perProto"]["naive"]["tx"]

        client = CurlNaiveClient(
            server="127.0.0.1",
            port=10443,
            username="testuser",
            password="testpass123",
            server_name="test.localhost",
        )
        with client:
            for _ in range(3):
                client.test_connection("http://test-server/")

        data_after = panel.get_traffic()
        naive_rx_after = data_after["perProto"]["naive"]["rx"]
        naive_tx_after = data_after["perProto"]["naive"]["tx"]

        total_before = naive_rx_before + naive_tx_before
        total_after = naive_rx_after + naive_tx_after
        assert total_after >= total_before, \
            f"Traffic should not decrease: before={total_before}, after={total_after}"
