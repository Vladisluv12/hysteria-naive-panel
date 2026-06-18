import json
import threading
import time
import subprocess

import pytest

from helpers.panel_client import PanelClient


class TestSQLiteScenarios:
    """Scenarios C1, C2, C5 — SQLite verification without panel restarts."""

    # ── C1: JSON mode — no panel.db, file verification ──
    def test_json_mode_no_sqlite_db(self, docker_panel_control, docker_services):
        ctrl = docker_panel_control

        panel = PanelClient("http://127.0.0.1:3000")
        assert panel.login()

        ctrl.exec_rm("/app/data/panel.db")

        panel.create_naive_user("json_test", "JsonPass1!")
        assert not ctrl.exec_exists("/app/data/panel.db"), \
            "panel.db should NOT exist in JSON mode"

        config_json = ctrl.exec_read("/config-share/config.json")
        assert config_json is not None
        cfg = json.loads(config_json)
        assert any(u["username"] == "json_test" for u in cfg["naiveUsers"])

        panel.delete_naive_user("json_test")

    # ── C2: SQLite mode — dual-write verification ──
    def test_sqlite_dual_write(self, panel_sqlite_api):
        panel = panel_sqlite_api
        username = f"sqlite_test_{int(time.time())}"
        result = panel.create_naive_user(username, "SQLiteP1!")
        assert result["success"] is True

        r = subprocess.run(
            ["docker", "exec", "nt-panel-sqlite",
             "sqlite3", "/app/data/panel.db",
             "SELECT value FROM meta WHERE key='config'"],
            capture_output=True, text=True, timeout=5,
        )
        assert r.returncode == 0, f"sqlite3 error: {r.stderr}"
        cfg = json.loads(r.stdout.strip())
        assert any(u["username"] == username for u in cfg["naiveUsers"])

        cfg_api = panel.get_config()
        assert any(u["username"] == username for u in cfg_api["naiveUsers"])

        users = panel.get_naive_users()
        assert any(u["username"] == username for u in users)

        panel.delete_naive_user(username)

    # ── C5: WAL mode — concurrent reads during writes ──
    def test_sqlite_wal_concurrent(self, panel_sqlite_api):
        panel = panel_sqlite_api
        results = []
        errors = []

        def reader():
            try:
                for _ in range(20):
                    r = panel.session.get("http://127.0.0.1:3001/api/naive/users")
                    assert r.status_code == 200
                    time.sleep(0.01)
                results.append("reader_ok")
            except Exception as e:
                errors.append(f"reader_err: {e}")

        def writer():
            try:
                for i in range(20):
                    uname = f"concur_user_{int(time.time())}_{i}"
                    resp = panel.session.post(
                        "http://127.0.0.1:3001/api/naive/users",
                        json={"username": uname, "password": "ConcurP1!", "expireDays": 30},
                    )
                    if resp.status_code != 200:
                        errors.append(f"writer_{i}: {resp.status_code} {resp.text}")
                    time.sleep(0.01)
                results.append("writer_ok")
            except Exception as e:
                errors.append(f"writer_err: {e}")

        t1 = threading.Thread(target=reader)
        t2 = threading.Thread(target=writer)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        assert not errors, f"Errors: {errors}"
        assert "reader_ok" in results
        assert "writer_ok" in results

        users = panel.get_naive_users()
        concur_users = [u for u in users if u["username"].startswith("concur_user_")]
        for u in concur_users:
            panel.delete_naive_user(u["username"])
