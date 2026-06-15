import json
import time
from datetime import datetime, timezone

import pytest
import requests

from helpers.panel_client import PanelClient

PANEL_URL = "http://127.0.0.1:3000"


def fresh_client():
    return PanelClient(PANEL_URL)


class TestAuthScenarios:
    """Scenarios A1-A4, D1, D2, D4, D6 from scenarios document."""

    def _raw(self, method, path):
        return requests.request(method, f"{PANEL_URL}{path}")

    # ── A1: Fresh panel — unauthenticated access returns 401 ──
    def test_unauthenticated_access_401(self, docker_services):
        endpoints = [
            ("GET", "/api/config"),
            ("GET", "/api/status"),
            ("GET", "/api/traffic"),
            ("GET", "/api/naive/users"),
            ("POST", "/api/naive/users"),
            ("DELETE", "/api/naive/users/test"),
            ("GET", "/api/hy2/users"),
            ("POST", "/api/hy2/users"),
            ("DELETE", "/api/hy2/users/test"),
            ("GET", "/api/system/version"),
            ("GET", "/api/me"),
        ]
        for method, path in endpoints:
            r = self._raw(method, path)
            assert r.status_code == 401, f"{method} {path} should be 401, got {r.status_code}"
            data = r.json()
            assert data.get("error") == "Unauthorized"

    # ── A2: Login with wrong password ──
    def test_login_wrong_password(self, docker_services):
        c = fresh_client()
        resp = c.login_raw(username="admin", password="wrongpass")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "Неверный логин или пароль" in data.get("message", "")

    def test_login_wrong_username(self, docker_services):
        c = fresh_client()
        resp = c.login_raw(username="nonexistent_admin", password="admin")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "Неверный логин или пароль" in data.get("message", "")

    def test_login_empty_credentials(self, docker_services):
        c = fresh_client()
        resp = c.login_raw(username="", password="")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False

    # ── A3: Login with correct password → session cookie ──
    def test_login_correct_session(self, docker_services):
        c = fresh_client()
        resp = c.login_raw(username="admin", password="admin")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "mustChangePassword" in data
        assert "rixxx_sid" in c.session.cookies
        assert c.session.cookies["rixxx_sid"] != ""

        me = c.get_me()
        assert me["username"] == "admin"

    def test_login_session_persists_across_requests(self, docker_services):
        c = fresh_client()
        assert c.login()

        me = c.get_me()
        assert me["username"] == "admin"

        cfg = c.get_config()
        assert isinstance(cfg, dict)

        status = c.get_status()
        assert isinstance(status, dict)

    # ── A4: GET /api/config returns default config ──
    def test_config_default_structure(self, panel_api):
        cfg = panel_api.get_config()
        assert "installed" in cfg
        assert "stack" in cfg
        assert "domain" in cfg
        assert "email" in cfg
        assert "serverIp" in cfg
        assert "arch" in cfg
        assert "naiveUsers" in cfg
        assert "hy2Users" in cfg
        assert isinstance(cfg["naiveUsers"], list)
        assert isinstance(cfg["hy2Users"], list)
        assert isinstance(cfg["stack"], dict)
        assert "naive" in cfg["stack"]
        assert "hy2" in cfg["stack"]

    # ── D1: Login handling — consecutive failed/successful attempts ──
    def test_login_consecutive_attempts(self, docker_services):
        c = fresh_client()
        for i in range(5):
            resp = c.login_raw("admin", f"wrong{i}")
            assert resp.status_code == 200
            assert resp.json()["success"] is False

        resp = c.login_raw("admin", "admin")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "mustChangePassword" in data

    # ── D2: Access without auth → 401 (covered in A1) ──
    def test_config_without_auth_401(self, docker_services):
        r = self._raw("GET", "/api/config")
        assert r.status_code == 401

        r = self._raw("GET", "/api/status")
        assert r.status_code == 401

        r = self._raw("GET", "/api/traffic")
        assert r.status_code == 401

    # ── D4: Invalid session → 401 ──
    def test_logout_invalidates_session(self, docker_services):
        c = fresh_client()
        assert c.login()

        r = c.logout_raw()
        assert r.status_code == 200

        r2 = c.get_config_raw()
        assert r2.status_code == 401

    def test_tampered_cookie_401(self, docker_services):
        r = requests.get(
            f"{PANEL_URL}/api/config",
            cookies={"rixxx_sid": "invalid_session_id"}
        )
        assert r.status_code == 401

    def test_empty_cookie_401(self, docker_services):
        r = requests.get(
            f"{PANEL_URL}/api/config",
            cookies={"rixxx_sid": ""}
        )
        assert r.status_code == 401

    # ── D6: Duplicate sessions ──
    def test_duplicate_sessions_independent(self, docker_services):
        s1 = fresh_client()
        s2 = fresh_client()

        assert s1.login()
        assert s2.login()

        me1 = s1.get_me()
        me2 = s2.get_me()
        assert me1["username"] == "admin"
        assert me2["username"] == "admin"

        s1.logout()

        r1 = s1.get_config_raw()
        assert r1.status_code == 401

        r2 = s2.get_config_raw()
        assert r2.status_code == 200


class TestUserManagement:
    """Scenarios B1-B10 from scenarios document."""

    # ── B1: List users when empty ──
    def test_empty_naive_users_list(self, panel_api):
        users = panel_api.get_naive_users()
        assert isinstance(users, list)

    def test_empty_hy2_users_list(self, panel_api):
        users = panel_api.get_hy2_users()
        assert isinstance(users, list)

    # ── B2: Create NaiveProxy user ──
    def test_create_naive_user(self, panel_api):
        username = f"test_b2_{int(time.time())}"
        result = panel_api.create_naive_user(username, "TestPass123!")
        assert result["success"] is True
        assert "link" in result

        users = panel_api.get_naive_users()
        assert any(u["username"] == username for u in users)

        cfg = panel_api.get_config()
        assert any(u["username"] == username for u in cfg["naiveUsers"])

        panel_api.delete_naive_user(username)

    # ── B3: Create Hysteria2 user ──
    def test_create_hy2_user(self, panel_api):
        username = f"test_b3_{int(time.time())}"
        result = panel_api.create_hy2_user(username, "HyPass123!")
        assert result["success"] is True
        assert "link" in result

        users = panel_api.get_hy2_users()
        assert any(u["username"] == username for u in users)

        panel_api.delete_hy2_user(username)

    # ── B4: Create user with expiry date ──
    def test_create_user_with_expiry(self, panel_api):
        username = f"test_b4_{int(time.time())}"
        result = panel_api.create_naive_user_raw(username, "ExpiryPass1!", expire_days=30)
        data = result.json()
        assert data["success"] is True

        users = panel_api.get_naive_users()
        user = next(u for u in users if u["username"] == username)
        assert user["expiresAt"] is not None
        assert user["remainingSec"] is not None
        assert user["expired"] is False

        expires = datetime.fromisoformat(user["expiresAt"])
        assert expires > datetime.now(timezone.utc)

        panel_api.delete_naive_user(username)

    def test_create_user_with_default_expiry_zero_means_unlimited(self, panel_api):
        username = f"test_unlimited_{int(time.time())}"
        result = panel_api.create_naive_user(username, "Unlimited1!", expire_days=0)
        assert result["success"] is True

        users = panel_api.get_naive_users()
        user = next(u for u in users if u["username"] == username)
        assert user["expired"] is False

        panel_api.delete_naive_user(username)

    # ── B5: Delete existing user ──
    def test_delete_naive_user(self, panel_api):
        username = f"test_b5_{int(time.time())}"
        panel_api.create_naive_user(username, "DeletePass1!")

        users_before = panel_api.get_naive_users()
        assert any(u["username"] == username for u in users_before)

        result = panel_api.delete_naive_user(username)
        assert result["success"] is True

        users_after = panel_api.get_naive_users()
        assert not any(u["username"] == username for u in users_after)

        cfg = panel_api.get_config()
        assert not any(u["username"] == username for u in cfg["naiveUsers"])

    def test_delete_hy2_user(self, panel_api):
        username = f"test_hy2del_{int(time.time())}"
        panel_api.create_hy2_user(username, "HyDelPass1!")

        users_before = panel_api.get_hy2_users()
        assert any(u["username"] == username for u in users_before)

        result = panel_api.delete_hy2_user(username)
        assert result["success"] is True

        users_after = panel_api.get_hy2_users()
        assert not any(u["username"] == username for u in users_after)

    # ── B6: Delete non-existent user → error ──
    def test_delete_nonexistent_naive_user(self, panel_api):
        resp = panel_api.delete_naive_user_raw("nonexistent_user_xyz")
        data = resp.json()
        assert data["success"] is False
        assert "Не найден" in data.get("message", "")

    def test_delete_nonexistent_hy2_user(self, panel_api):
        resp = panel_api.delete_hy2_user_raw("nonexistent_user_xyz")
        data = resp.json()
        assert data["success"] is False

    # ── B7: Update user expiry ──
    def test_update_naive_user_expiry(self, panel_api):
        username = f"test_b7_{int(time.time())}"
        panel_api.create_naive_user(username, "RenewPass1!", expire_days=7)

        result = panel_api.change_user_expiry("naive", username, 60)
        assert result["success"] is True
        assert result["expiresAt"] is not None

        users = panel_api.get_naive_users()
        user = next(u for u in users if u["username"] == username)
        assert user["expired"] is False

        panel_api.delete_naive_user(username)

    def test_update_hy2_user_expiry(self, panel_api):
        username = f"test_hy2renew_{int(time.time())}"
        panel_api.create_hy2_user(username, "HyRenewP1!", expire_days=7)

        result = panel_api.change_user_expiry("hy2", username, 90)
        assert result["success"] is True

        panel_api.delete_hy2_user(username)

    def test_update_nonexistent_user_expiry(self, panel_api):
        resp = panel_api.change_user_expiry_raw("naive", "no_such_user", 30)
        data = resp.json()
        assert data["success"] is False

    # ── B8: Create user with duplicate username ──
    def test_duplicate_naive_username(self, panel_api):
        username = f"test_b8_{int(time.time())}"
        r1 = panel_api.create_naive_user(username, "FirstPass1!")
        assert r1["success"] is True

        resp = panel_api.create_naive_user_raw(username, "SecondPass1!")
        data = resp.json()
        assert data["success"] is False
        assert "уже существует" in data.get("message", "")

        panel_api.delete_naive_user(username)

    def test_duplicate_hy2_username(self, panel_api):
        username = f"test_hy8dup_{int(time.time())}"
        panel_api.create_hy2_user(username, "FirstHyP1!")
        resp = panel_api.create_hy2_user_raw(username, "SecondHyP1!")
        data = resp.json()
        assert data["success"] is False
        assert "уже существует" in data.get("message", "")

        panel_api.delete_hy2_user(username)

    # ── B9: Create user with invalid username ──
    def test_invalid_usernames_rejected(self, panel_api):
        invalid_usernames = [
            "",
            " ",
            "user name",
            "user@name",
            "user,name",
            "a" * 33,
        ]
        for uname in invalid_usernames:
            resp = panel_api.create_naive_user_raw(uname, "ValidPass1!")
            data = resp.json()
            assert data["success"] is False, f"Should reject username: '{uname}'"

    def test_valid_usernames_accepted(self, panel_api):
        valid = ["a", "user.name", "user_name", "user-name", "User123", "a" * 32]
        for uname in valid:
            resp = panel_api.create_naive_user_raw(uname, "ValidPass1!")
            data = resp.json()
            assert data["success"] is True, f"Should accept username: '{uname}'"
            panel_api.delete_naive_user(uname)

    # ── B10: Create user with invalid password ──
    def test_invalid_passwords_rejected(self, panel_api):
        invalid_passwords = [
            "",
            "short",
            "a" * 129,
        ]
        for pwd in invalid_passwords:
            resp = panel_api.create_naive_user_raw("pwdtest", pwd)
            data = resp.json()
            assert data["success"] is False, f"Should reject short/empty/long password: '{pwd[:20]}'"

    def test_valid_passwords_accepted(self, panel_api):
        valid_passwords = [
            "MyPass123!",
            "a" * 8,
            "a" * 128,
            "!@#$%^&*_+-=.,~",
        ]
        for pwd in valid_passwords:
            resp = panel_api.create_naive_user_raw("pwdgood", pwd)
            data = resp.json()
            assert data["success"] is True, f"Should accept password length {len(pwd)}"
            panel_api.delete_naive_user("pwdgood")


class TestConfigStatusTraffic:
    """Scenarios E1, E2 from scenarios document."""

    # ── E1: GET /api/status ──
    def test_status_structure(self, panel_api):
        data = panel_api.get_status()
        assert "installed" in data
        assert "stack" in data
        assert isinstance(data["stack"], dict)

        if data["installed"] is False:
            assert data["stack"]["naive"] is False
            assert data["stack"]["hy2"] is False
        else:
            assert "domain" in data
            assert "email" in data
            assert "serverIp" in data
            assert "arch" in data

    # ── E2: GET /api/traffic ──
    def test_traffic_structure(self, panel_api):
        data = panel_api.get_traffic()
        assert "daily" in data
        assert "perProto" in data
        assert "connections" in data
        assert "hourly" in data
        assert "lastReset" in data

        if data["daily"] is not None:
            assert "rx" in data["daily"]
            assert "tx" in data["daily"]
            assert "rxFormatted" in data["daily"]
            assert "txFormatted" in data["daily"]
            assert "totalFormatted" in data["daily"]

        assert "naive" in data["perProto"]
        assert "hy2" in data["perProto"]
        for proto in ["naive", "hy2"]:
            assert "rx" in data["perProto"][proto]
            assert "tx" in data["perProto"][proto]
            assert "rxFormatted" in data["perProto"][proto]
            assert "txFormatted" in data["perProto"][proto]
            assert "totalFormatted" in data["perProto"][proto]

        assert "naive" in data["connections"]
        assert "hy2" in data["connections"]

        assert isinstance(data["hourly"], list)

    def test_traffic_returns_valid_values(self, panel_api):
        data = panel_api.get_traffic()
        for proto in ["naive", "hy2"]:
            assert isinstance(data["perProto"][proto]["rx"], (int, float))
            assert isinstance(data["perProto"][proto]["tx"], (int, float))
            if data["connections"][proto] is not None:
                assert isinstance(data["connections"][proto], (int, float))


class TestVersionAndMe:
    """Additional API endpoint tests."""

    def test_get_version(self, panel_api):
        data = panel_api.get_version()
        assert isinstance(data, dict)

    def test_get_me_returns_user_info(self, panel_api):
        data = panel_api.get_me()
        assert "username" in data
        assert "role" in data
        assert "mustChangePassword" in data

    def test_change_password_rejects_wrong_current(self, panel_api):
        result = panel_api.change_password("wrong_current", "NewPass123!")
        assert result["success"] is False

    def test_change_password_rejects_short_new(self, panel_api):
        result = panel_api.change_password("admin", "12345")
        assert result["success"] is False
        assert "6 символов" in result.get("message", "")


class TestUserListAfterCreateDelete:
    """Verify consistency after create/delete cycles."""

    def test_user_count_consistent(self, panel_api):
        username = f"test_count_{int(time.time())}"

        before = len(panel_api.get_naive_users())
        panel_api.create_naive_user(username, "CountPass1!")
        after_create = len(panel_api.get_naive_users())
        assert after_create == before + 1

        panel_api.delete_naive_user(username)
        after_delete = len(panel_api.get_naive_users())
        assert after_delete == before

    def test_user_fields_present(self, panel_api):
        username = f"test_fields_{int(time.time())}"
        panel_api.create_naive_user(username, "FieldsP1!", expire_days=30)

        users = panel_api.get_naive_users()
        user = next(u for u in users if u["username"] == username)

        expected_fields = ["username", "createdAt", "expiresAt", "expired", "remainingSec"]
        for field in expected_fields:
            assert field in user, f"Missing field: {field}"

        panel_api.delete_naive_user(username)
