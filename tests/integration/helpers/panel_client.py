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
        self.csrf_token: str | None = None
        self._on_change_naive = on_change_naive
        self._on_change_hy2 = on_change_hy2

    def _get_csrf(self):
        resp = self.session.get(f"{self.base_url}/api/csrf-token")
        resp.raise_for_status()
        data = resp.json()
        self.csrf_token = data.get("csrfToken", "")
        return self.csrf_token

    def login(self, username: str = "admin", password: str = "admin") -> bool:
        self._get_csrf()
        resp = self.session.post(
            f"{self.base_url}/api/login",
            json={"username": username, "password": password},
            headers={"X-CSRF-Token": self.csrf_token or ""},
        )
        return resp.json().get("success", False)

    def _api_call(self, method: str, path: str, **kwargs):
        if self.csrf_token:
            headers = kwargs.pop("headers", {})
            headers["X-CSRF-Token"] = self.csrf_token
            kwargs["headers"] = headers
        resp = self.session.request(method, f"{self.base_url}{path}", **kwargs)
        resp.raise_for_status()
        return resp.json()

    def create_naive_user(
        self, username: str, password: str, expire_days: int = 0
    ) -> dict:
        result = self._api_call(
            "POST",
            "/api/naive/users",
            json={"username": username, "password": password, "expire_days": expire_days},
        )
        if self._on_change_naive:
            self._on_change_naive()
        return result

    def delete_naive_user(self, username: str) -> dict:
        result = self._api_call("DELETE", f"/api/naive/users/{username}")
        if self._on_change_naive:
            self._on_change_naive()
        return result

    def get_naive_users(self) -> list:
        return self._api_call("GET", "/api/naive/users").get("users", [])

    def create_hy2_user(
        self, username: str, password: str, expire_days: int = 0
    ) -> dict:
        result = self._api_call(
            "POST",
            "/api/hy2/users",
            json={"username": username, "password": password, "expire_days": expire_days},
        )
        if self._on_change_hy2:
            self._on_change_hy2()
        return result

    def delete_hy2_user(self, username: str) -> dict:
        result = self._api_call("DELETE", f"/api/hy2/users/{username}")
        if self._on_change_hy2:
            self._on_change_hy2()
        return result

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

    def get_config(self) -> dict:
        return self._api_call("GET", "/api/config")

    def get_status(self) -> dict:
        return self._api_call("GET", "/api/status")
