from typing import Callable

import requests


class PanelClient:
    """HTTP client for the panel management API."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:3000",
        on_change_naive: Callable | None = None,
        on_change_hy2: Callable | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self._on_change_naive = on_change_naive
        self._on_change_hy2 = on_change_hy2

    def login(self, username: str = "admin", password: str = "admin") -> bool:
        resp = self.session.post(
            f"{self.base_url}/api/login",
            json={"username": username, "password": password},
        )
        return resp.json().get("success", False)

    def login_raw(self, username: str = "admin", password: str = "admin"):
        resp = self.session.post(
            f"{self.base_url}/api/login",
            json={"username": username, "password": password},
        )
        return resp

    def logout(self) -> dict:
        return self._api_call("POST", "/api/logout")

    def logout_raw(self):
        return self.session.post(f"{self.base_url}/api/logout")

    def get_me(self) -> dict:
        return self._api_call("GET", "/api/me")

    def get_me_raw(self):
        return self.session.get(f"{self.base_url}/api/me")

    def change_password(self, current_password: str, new_password: str) -> dict:
        return self._api_call(
            "POST",
            "/api/config/change-password",
            json={"currentPassword": current_password, "newPassword": new_password},
        )

    def get_traffic(self) -> dict:
        return self._api_call("GET", "/api/traffic")

    def get_version(self) -> dict:
        return self._api_call("GET", "/api/system/version")

    def raw_request(self, method: str, path: str, **kwargs):
        return self.session.request(method, f"{self.base_url}{path}", **kwargs)

    def _api_call(self, method: str, path: str, **kwargs):
        resp = self.session.request(method, f"{self.base_url}{path}", **kwargs)
        resp.raise_for_status()
        return resp.json()

    def create_naive_user(
        self, username: str, password: str, expire_days: int = 0
    ) -> dict:
        result = self._api_call(
            "POST",
            "/api/naive/users",
            json={"username": username, "password": password, "expireDays": expire_days},
        )
        if self._on_change_naive:
            self._on_change_naive()
        return result

    def create_naive_user_raw(
        self, username: str, password: str, expire_days: int = 0
    ):
        return self.raw_request(
            "POST",
            "/api/naive/users",
            json={"username": username, "password": password, "expireDays": expire_days},
        )

    def delete_naive_user(self, username: str) -> dict:
        result = self._api_call("DELETE", f"/api/naive/users/{username}")
        if self._on_change_naive:
            self._on_change_naive()
        return result

    def delete_naive_user_raw(self, username: str):
        return self.raw_request("DELETE", f"/api/naive/users/{username}")

    def get_naive_users(self) -> list:
        return self._api_call("GET", "/api/naive/users").get("users", [])

    def create_hy2_user(
        self, username: str, password: str, expire_days: int = 0
    ) -> dict:
        result = self._api_call(
            "POST",
            "/api/hy2/users",
            json={"username": username, "password": password, "expireDays": expire_days},
        )
        if self._on_change_hy2:
            self._on_change_hy2()
        return result

    def create_hy2_user_raw(
        self, username: str, password: str, expire_days: int = 0
    ):
        return self.raw_request(
            "POST",
            "/api/hy2/users",
            json={"username": username, "password": password, "expireDays": expire_days},
        )

    def delete_hy2_user(self, username: str) -> dict:
        result = self._api_call("DELETE", f"/api/hy2/users/{username}")
        if self._on_change_hy2:
            self._on_change_hy2()
        return result

    def delete_hy2_user_raw(self, username: str):
        return self.raw_request("DELETE", f"/api/hy2/users/{username}")

    def get_hy2_users(self) -> list:
        return self._api_call("GET", "/api/hy2/users").get("users", [])

    def change_user_expiry(self, proto: str, username: str, expire_days: int) -> dict:
        endpoint = "naive" if proto == "naive" else "hy2"
        result = self._api_call(
            "PATCH",
            f"/api/{endpoint}/users/{username}",
            json={"expireDays": expire_days},
        )
        if proto == "naive" and self._on_change_naive:
            self._on_change_naive()
        elif proto != "naive" and self._on_change_hy2:
            self._on_change_hy2()
        return result

    def change_user_expiry_raw(self, proto: str, username: str, expire_days: int):
        endpoint = "naive" if proto == "naive" else "hy2"
        return self.raw_request(
            "PATCH",
            f"/api/{endpoint}/users/{username}",
            json={"expireDays": expire_days},
        )

    def get_config(self) -> dict:
        return self._api_call("GET", "/api/config")

    def get_config_raw(self):
        return self.raw_request("GET", "/api/config")

    def get_status(self) -> dict:
        return self._api_call("GET", "/api/status")
