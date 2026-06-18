import time


class TestMultiUserCreation:
    """Create multiple users for naive and hysteria2, verify in API."""

    def test_create_multiple_naive_users(self, panel_api):
        """Create 5 naive users, verify all appear in API response."""
        t = int(time.time())
        usernames = [f"user_naive_{t}_{i}" for i in range(5)]
        password = "TestPass123!"

        for uname in usernames:
            result = panel_api.create_naive_user(uname, password)
            assert result["success"] is True

        naive_users = panel_api.get_naive_users()
        for uname in usernames:
            assert any(u["username"] == uname for u in naive_users), \
                f"User {uname} not found in GET /api/naive/users"

        cfg = panel_api.get_config()
        for uname in usernames:
            assert any(u["username"] == uname for u in cfg["naiveUsers"]), \
                f"User {uname} not found in GET /api/config naiveUsers"

        for uname in usernames:
            panel_api.delete_naive_user(uname)

        naive_users_after = panel_api.get_naive_users()
        for uname in usernames:
            assert not any(u["username"] == uname for u in naive_users_after), \
                f"User {uname} should be deleted"

    def test_create_multiple_hy2_users(self, panel_api):
        """Create 5 hysteria2 users, verify all appear in API response."""
        t = int(time.time())
        usernames = [f"user_hy2_{t}_{i}" for i in range(5)]
        password = "HyPass123!"

        for uname in usernames:
            result = panel_api.create_hy2_user(uname, password)
            assert result["success"] is True

        hy2_users = panel_api.get_hy2_users()
        for uname in usernames:
            assert any(u["username"] == uname for u in hy2_users), \
                f"User {uname} not found in GET /api/hy2/users"

        cfg = panel_api.get_config()
        for uname in usernames:
            assert any(u["username"] == uname for u in cfg["hy2Users"]), \
                f"User {uname} not found in GET /api/config hy2Users"

        for uname in usernames:
            panel_api.delete_hy2_user(uname)

        hy2_users_after = panel_api.get_hy2_users()
        for uname in usernames:
            assert not any(u["username"] == uname for u in hy2_users_after), \
                f"User {uname} should be deleted"

    def test_mixed_users_independence(self, panel_api):
        """Create naive and hy2 users with same username, verify independence."""
        t = int(time.time())
        username = f"mixed_{t}"
        naive_pass = "NaivePass1!"
        hy2_pass = "Hy2PassOne!"

        naive_result = panel_api.create_naive_user(username, naive_pass)
        assert naive_result["success"] is True

        hy2_result = panel_api.create_hy2_user(username, hy2_pass)
        assert hy2_result["success"] is True

        naive_users = panel_api.get_naive_users()
        naive_user = next(u for u in naive_users if u["username"] == username)

        hy2_users = panel_api.get_hy2_users()
        hy2_user = next(u for u in hy2_users if u["username"] == username)

        assert naive_user is not None
        assert hy2_user is not None

        cfg = panel_api.get_config()
        assert any(u["username"] == username for u in cfg["naiveUsers"])
        assert any(u["username"] == username for u in cfg["hy2Users"])

        panel_api.delete_naive_user(username)
        naive_after = panel_api.get_naive_users()
        assert not any(u["username"] == username for u in naive_after)

        hy2_after_delete_naive = panel_api.get_hy2_users()
        assert any(u["username"] == username for u in hy2_after_delete_naive), \
            "Hy2 user should still exist after deleting naive user with same name"

        panel_api.delete_hy2_user(username)

    def test_user_link_format(self, panel_api):
        """Verify user links have correct format or null when not installed."""
        t = int(time.time())
        uname_naive = f"link_naive_{t}"
        uname_hy2 = f"link_hy2_{t}"
        password = "LinkPass1!"

        cfg = panel_api.get_config()

        naive_result = panel_api.create_naive_user(uname_naive, password)
        assert naive_result["success"] is True
        assert "link" in naive_result
        naive_link = naive_result["link"]
        if cfg.get("installed"):
            assert naive_link is not None, "Link should not be null when installed"
            assert naive_link.startswith("naive+https://"), \
                f"Naive link should start with naive+https://, got: {naive_link}"
            assert f"{uname_naive}:{password}" in naive_link, \
                f"Naive link should contain credentials, got: {naive_link}"

        hy2_result = panel_api.create_hy2_user(uname_hy2, password)
        assert hy2_result["success"] is True
        assert "link" in hy2_result
        hy2_link = hy2_result["link"]
        if cfg.get("installed"):
            assert hy2_link is not None, "Link should not be null when installed"
            assert hy2_link.startswith("hysteria2://"), \
                f"Hy2 link should start with hysteria2://, got: {hy2_link}"
            assert "sni=" in hy2_link, \
                f"Hy2 link should contain sni parameter, got: {hy2_link}"
            assert "insecure=0" in hy2_link or "insecure=1" in hy2_link, \
                f"Hy2 link should contain insecure parameter, got: {hy2_link}"

        panel_api.delete_naive_user(uname_naive)
        panel_api.delete_hy2_user(uname_hy2)

    def test_create_users_with_expiry(self, panel_api):
        """Create users with different expiry values, verify fields."""
        t = int(time.time())
        expiry_configs = [
            (0, "unlimited"),
            (7, "weekly"),
            (30, "monthly"),
            (365, "yearly"),
        ]

        for expire_days, label in expiry_configs:
            uname = f"exp_{label}_{t}"
            password = "ExpiryP1!"

            result = panel_api.create_naive_user_raw(uname, password, expire_days=expire_days)
            data = result.json()
            assert data["success"] is True, f"Failed to create user with expireDays={expire_days}"

            users = panel_api.get_naive_users()
            user = next(u for u in users if u["username"] == uname)

            assert "expiresAt" in user, f"Missing expiresAt for {label}"
            assert "remainingSec" in user, f"Missing remainingSec for {label}"
            assert "expired" in user, f"Missing expired field for {label}"
            assert user["expired"] is False, f"Newly created user should not be expired: {label}"

            if expire_days == 0:
                assert user["remainingSec"] is None, \
                    f"expireDays=0 should have remainingSec=None, got {user['remainingSec']}"

        for _, label in expiry_configs:
            uname = f"exp_{label}_{t}"
            panel_api.delete_naive_user(uname)

    def test_create_and_immediately_verify(self, panel_api):
        """Create user, verify immediately via API without delay."""
        t = int(time.time())
        for i in range(3):
            uname = f"rapid_{t}_{i}"
            password = "RapidP1!"

            result = panel_api.create_naive_user(uname, password)
            assert result["success"] is True

            users = panel_api.get_naive_users()
            assert any(u["username"] == uname for u in users), \
                f"Rapid check: {uname} should be visible immediately"

            cfg = panel_api.get_config()
            assert any(u["username"] == uname for u in cfg["naiveUsers"]), \
                f"Rapid check: {uname} should be in config immediately"

            del_result = panel_api.delete_naive_user(uname)
            assert del_result["success"] is True

            users_after = panel_api.get_naive_users()
            assert not any(u["username"] == uname for u in users_after), \
                f"Rapid check: {uname} should be gone immediately"
