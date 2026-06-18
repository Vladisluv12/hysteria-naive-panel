import json
import subprocess
import time

from helpers.panel_client import PanelClient


class TestPanelMigration:
    """C3, C4 — JSON↔SQLite migration tests that restart the panel."""

    # ── C3: JSON→SQLite migration ──
    def test_json_to_sqlite_migration(self, docker_panel_control, docker_services):
        ctrl = docker_panel_control

        ctrl.restart()
        assert ctrl.wait_ready(), "Panel should be ready in JSON mode"

        panel = PanelClient("http://127.0.0.1:3000")
        assert panel.login()

        naive_user = f"migrate_n_{int(time.time())}"
        hy2_user = f"migrate_h_{int(time.time())}"
        panel.create_naive_user(naive_user, "MigrateN1!")
        panel.create_hy2_user(hy2_user, "MigrateH1!")

        ctrl.exec_rm("/app/data/panel.db")

        ctrl.restart(extra_env={"USE_SQLITE": "true"})
        assert ctrl.wait_ready(), "Panel should be ready in SQLite mode"

        panel2 = PanelClient("http://127.0.0.1:3000")
        assert panel2.login()

        naive_users = panel2.get_naive_users()
        assert any(u["username"] == naive_user for u in naive_users)

        hy2_users = panel2.get_hy2_users()
        assert any(u["username"] == hy2_user for u in hy2_users)

        r = subprocess.run(
            ["docker", "exec", "nt-panel",
             "sqlite3", "/app/data/panel.db",
             "SELECT value FROM meta WHERE key='config'"],
            capture_output=True, text=True, timeout=5,
        )
        cfg = json.loads(r.stdout.strip())
        assert any(u["username"] == naive_user for u in cfg["naiveUsers"])
        assert any(u["username"] == hy2_user for u in cfg["hy2Users"])

        panel2.delete_naive_user(naive_user)
        panel2.delete_hy2_user(hy2_user)

        ctrl.restart()
        assert ctrl.wait_ready(), "Panel should be restored to JSON mode"

    # ── C4: SQLite→JSON fallback ──
    def test_sqlite_to_json_fallback(self, docker_panel_control, docker_services):
        ctrl = docker_panel_control

        ctrl.restart(extra_env={"USE_SQLITE": "true"})
        assert ctrl.wait_ready(), "Panel should be ready in SQLite mode"

        panel = PanelClient("http://127.0.0.1:3000")
        assert panel.login()

        naive_user = f"fallback_n_{int(time.time())}"
        hy2_user = f"fallback_h_{int(time.time())}"
        panel.create_naive_user(naive_user, "FallbackN!!")
        panel.create_hy2_user(hy2_user, "FallbackH!!")

        ctrl.restart(extra_env={"USE_SQLITE": "false"})
        assert ctrl.wait_ready(), "Panel should be ready in JSON mode"

        panel2 = PanelClient("http://127.0.0.1:3000")
        assert panel2.login()

        naive_users = panel2.get_naive_users()
        hy2_users = panel2.get_hy2_users()
        all_naive = [u["username"] for u in naive_users]
        all_hy2 = [u["username"] for u in hy2_users]
        assert naive_user in all_naive, f"{naive_user} not in {all_naive}"
        assert hy2_user in all_hy2, f"{hy2_user} not in {all_hy2}"

        panel2.delete_naive_user(naive_user)
        panel2.delete_hy2_user(hy2_user)

        ctrl.restart()
        assert ctrl.wait_ready(), "Panel should be restored to JSON mode"


class TestPanelRestart:
    """D7 — Panel restart persistence (invalidates session)."""

    def test_restart_session_persistence(self, docker_panel_control, docker_services):
        ctrl = docker_panel_control

        panel = PanelClient("http://127.0.0.1:3000")
        assert panel.login()

        panel.create_naive_user("persist_test", "PersistPass1!")
        cfg_before = panel.get_config()

        ctrl.restart()
        assert ctrl.wait_ready(), "Panel should be ready after restart"

        r = panel.get_config_raw()
        assert r.status_code == 401, "Old session should be invalid after restart"

        panel2 = PanelClient("http://127.0.0.1:3000")
        assert panel2.login()

        cfg_after = panel2.get_config()
        assert cfg_after["installed"] == cfg_before["installed"]

        users = panel2.get_naive_users()
        assert any(u["username"] == "persist_test" for u in users)

        panel2.delete_naive_user("persist_test")
