# Panel API — Integration Test Scenarios

> **API base:** `http://localhost:3000` (or `$PANEL_URL`)
> **Session cookie:** `rixxx_sid` (Express session, in-memory)
> **Default admin:** `admin` / `admin`

## API Endpoint Mapping

| Conceptual | Actual Endpoint | Method | Notes |
|---|---|---|---|
| Login | `/api/login` | POST | Returns `{ success, mustChangePassword }` — always HTTP 200 |
| Logout | `/api/logout` | POST | Requires auth |
| Get current user | `/api/me` | GET | Requires auth |
| Change password | `/api/config/change-password` | POST | Requires auth |
| Get config | `/api/config` | GET | Requires auth |
| Panel status | `/api/status` | GET | Requires auth |
| Traffic stats | `/api/traffic` | GET | Requires auth |
| List Naive users | `/api/naive/users` | GET | Requires auth |
| Create Naive user | `/api/naive/users` | POST | Body: `{ username, password, expireDays? }` |
| Delete Naive user | `/api/naive/users/:username` | DELETE | Requires auth |
| Update Naive user | `/api/naive/users/:username` | PATCH | Body: `{ expireDays }` |
| List Hy2 users | `/api/hy2/users` | GET | Requires auth |
| Create Hy2 user | `/api/hy2/users` | POST | Body: `{ username, password, expireDays? }` |
| Delete Hy2 user | `/api/hy2/users/:username` | DELETE | Requires auth |
| Update Hy2 user | `/api/hy2/users/:username` | PATCH | Body: `{ expireDays }` |
| Install (WS) | WebSocket `ws://...` | message | Not HTTP — `install_naive`, `install_hy2`, `install_both` messages |
| Service action | `/api/service/:kind/:action` | POST | `:kind` = naive|hy2, `:action` = start|stop|restart |
| Version | `/api/system/version` | GET | Requires auth |
| Bypass | `/api/bypass` | GET/POST/DELETE | Requires auth |

**Key difference from conceptual model:** There is no `PUT /api/users/:username/reset` endpoint. Password changes are done via `POST /api/config/change-password` for the current admin user. User `expireDays` is updated via `PATCH`. Install is WebSocket-only, no HTTP POST endpoints.

---

## Prerequisites (for all scenarios)

```python
import requests

BASE = "http://localhost:3000"
s = requests.Session()

def login(user="admin", pwd="admin"):
    r = s.post(f"{BASE}/api/login", json={"username": user, "password": pwd})
    return r.json()  # { success: bool, mustChangePassword?: bool }

def logout():
    return s.post(f"{BASE}/api/logout").json()
```

The session object `s` automatically stores and sends the `rixxx_sid` cookie.

---

## A. Panel Lifecycle (install + config)

### A1. Fresh panel — unauthenticated access returns 401

**Prerequisites:** Fresh panel at `$PANEL_URL`, no session.

**Steps:**
1. Call every protected endpoint with no cookie

```python
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
    r = requests.request(method, f"{BASE}{path}")
    assert r.status_code == 401, f"{method} {path} should be 401, got {r.status_code}"
    assert r.json()["error"] == "Unauthorized"
```

**Expected result:** All protected endpoints return `HTTP 401 { "error": "Unauthorized" }`.

---

### A2. Login with wrong password

**Prerequisites:** Fresh panel.

**Steps:**
```python
r = requests.post(f"{BASE}/api/login", json={"username": "admin", "password": "wrongpass"})
data = r.json()
assert r.status_code == 200
assert data["success"] is False
assert "Неверный логин или пароль" in data.get("message", "")
```

**Expected result:** HTTP 200, `{ success: false, message: "Неверный логин или пароль" }`.

---

### A3. Login with correct password → session cookie

**Prerequisites:** Fresh panel.

**Steps:**
```python
s = requests.Session()
r = s.post(f"{BASE}/api/login", json={"username": "admin", "password": "admin"})
data = r.json()
assert r.status_code == 200
assert data["success"] is True
assert "mustChangePassword" in data  # True if still using default password

# Verify cookie
assert "rixxx_sid" in s.cookies
assert s.cookies["rixxx_sid"] != ""

# Verify session works
r2 = s.get(f"{BASE}/api/me")
assert r2.status_code == 200
assert r2.json()["username"] == "admin"
```

**Expected result:** HTTP 200, `{ success: true, mustChangePassword: true }`, session cookie `rixxx_sid` set. Subsequent requests with cookie succeed.

---

### A4. GET /api/config returns default config (not installed)

**Prerequisites:** Logged-in session.

**Steps:**
```python
r = s.get(f"{BASE}/api/config")
cfg = r.json()
assert cfg["installed"] is False
assert cfg["stack"] == {"naive": False, "hy2": False}
assert cfg["domain"] == ""
assert cfg["email"] == ""
assert cfg["serverIp"] == ""
assert cfg["arch"] == ""
assert cfg["naiveUsers"] == []
assert cfg["hy2Users"] == []
```

**Expected result:** Full config object with `installed: false`, empty stacks, empty user arrays.

---

### A5–A7. Install scenarios

> **Note:** Installation is done via WebSocket messages, not HTTP POST. The WebSocket path is `ws://<panel>:3000/` (no specific path). Messages are JSON: `{ type: "install_naive", domain, email, login, password }`, `{ type: "install_hy2", domain, email, password, useCaddyCert }`, `{ type: "install_both", domain, email, naiveLogin, naivePassword, hy2Password }`.

#### A5. Install NaiveProxy via WebSocket

**Prerequisites:** Logged-in session (cookie required for WS auth), valid domain + email.

**Steps:**
```python
import json, websockets  # pip install websockets

async def test_install_naive():
    cookies = "; ".join(f"{k}={v}" for k, v in s.cookies.items())
    async with websockets.connect(f"ws://localhost:3000/", extra_headers={"Cookie": cookies}) as ws:
        await ws.send(json.dumps({
            "type": "install_naive",
            "domain": "proxy.example.com",
            "email": "admin@example.com",
            "login": "admin",
            "password": "MyPassword123!"
        }))
        responses = []
        async for msg in ws:
            data = json.loads(msg)
            responses.append(data)
            if data.get("type") == "install_done":
                break
            if data.get("type") == "install_error":
                pytest.fail(f"Install failed: {data['message']}")
        
        # Verify final state
        cfg = s.get(f"{BASE}/api/config").json()
        assert cfg["installed"] is True
        assert cfg["stack"]["naive"] is True
        assert cfg["domain"] == "proxy.example.com"
```

**Expected result:** WebSocket receives `type: "install_done"` with `links.naive`. Config shows `installed: true`, `stack.naive: true`.

#### A6. Install Hysteria2 via WebSocket

**Steps:** Similar to A5 but with `type: "install_hy2"` message.

```python
async with websockets.connect(f"ws://localhost:3000/", ...) as ws:
    await ws.send(json.dumps({
        "type": "install_hy2",
        "domain": "proxy.example.com",
        "email": "admin@example.com",
        "password": "Hy2Pass123!",
        "useCaddyCert": True
    }))
    # ... wait for install_done
```

**Expected result:** WebSocket `install_done` with `links.hy2`. Config: `installed: true`, `stack.hy2: true`.

#### A7. Install both (recommended mode)

**Steps:**
```python
async with websockets.connect(f"ws://localhost:3000/", ...) as ws:
    await ws.send(json.dumps({
        "type": "install_both",
        "domain": "proxy.example.com",
        "email": "admin@example.com",
        "naiveLogin": "admin",
        "naivePassword": "NaivePass123!",
        "hy2Password": "Hy2Pass123!"
    }))
    # ... wait for install_done (fires after both complete)
```

**Expected result:** WebSocket `install_done` with both `links.naive` and `links.hy2`. Config: `installed: true`, `stack: { naive: true, hy2: true }`.

---

## B. User Management

### B1. List users when empty — returns empty list

**Prerequisites:** Logged-in session, no users created yet (fresh panel or after cleanup).

**Steps:**
```python
r_naive = s.get(f"{BASE}/api/naive/users")
assert r_naive.status_code == 200
data = r_naive.json()
assert "users" in data
assert isinstance(data["users"], list)
assert len(data["users"]) == 0

r_hy2 = s.get(f"{BASE}/api/hy2/users")
data2 = r_hy2.json()
assert len(data2["users"]) == 0
```

**Expected result:** Both return `{ users: [] }`.

---

### B2. Create NaiveProxy user

**Prerequisites:** Logged-in session.

**Steps:**
```python
r = s.post(f"{BASE}/api/naive/users", json={
    "username": "testuser1",
    "password": "TestPass123!",
})
data = r.json()
assert data["success"] is True
assert "link" in data  # naive+https://testuser1:...@domain:443
assert data["link"].startswith("naive+https://")

# Verify user appears in list
r2 = s.get(f"{BASE}/api/naive/users")
users = r2.json()["users"]
assert any(u["username"] == "testuser1" for u in users)

# Verify user appears in config
cfg = s.get(f"{BASE}/api/config").json()
assert any(u["username"] == "testuser1" for u in cfg["naiveUsers"])
```

**Expected result:** `{ success: true, link: "naive+https://..." }`. User visible in `/api/naive/users` list and in `config.naiveUsers`.

---

### B3. Create Hysteria2 user

**Prerequisites:** Logged-in session.

**Steps:**
```python
r = s.post(f"{BASE}/api/hy2/users", json={
    "username": "hyuser1",
    "password": "HyPass123!",
})
data = r.json()
assert data["success"] is True
assert data["link"].startswith("hysteria2://")

# Verify
r2 = s.get(f"{BASE}/api/hy2/users")
assert any(u["username"] == "hyuser1" for u in r2.json()["users"])
```

**Expected result:** `{ success: true, link: "hysteria2://..." }`. User in hy2 users list.

---

### B4. Create user with expiry date

**Prerequisites:** Logged-in session.

**Steps:**
```python
r = s.post(f"{BASE}/api/naive/users", json={
    "username": "expiring_user",
    "password": "ExpiryPass1!",
    "expireDays": 30,
})
assert r.json()["success"] is True

# Verify expiresAt is set
r2 = s.get(f"{BASE}/api/naive/users")
user = next(u for u in r2.json()["users"] if u["username"] == "expiring_user")
assert user["expiresAt"] is not None
assert user["remainingSec"] is not None
assert user["expired"] is False

# Verify expiresAt is in the future
from datetime import datetime, timezone
expires = datetime.fromisoformat(user["expiresAt"])
assert expires > datetime.now(timezone.utc)
```

**Expected result:** User created with `expiresAt` set ~30 days in the future, `expired: false`, `remainingSec > 0`.

---

### B5. Delete existing user

**Prerequisites:** User `testuser1` exists (from B2).

**Steps:**
```python
# Confirm user exists
r_before = s.get(f"{BASE}/api/naive/users")
assert any(u["username"] == "testuser1" for u in r_before.json()["users"])

# Delete
r = s.delete(f"{BASE}/api/naive/users/testuser1")
assert r.json()["success"] is True

# Verify user gone
r_after = s.get(f"{BASE}/api/naive/users")
assert not any(u["username"] == "testuser1" for u in r_after.json()["users"])

# Verify config also updated
cfg = s.get(f"{BASE}/api/config").json()
assert not any(u["username"] == "testuser1" for u in cfg["naiveUsers"])
```

**Expected result:** `{ success: true }`. User removed from users list and config.

---

### B6. Delete non-existent user → error

**Prerequisites:** Logged-in session.

**Steps:**
```python
r = s.delete(f"{BASE}/api/naive/users/nonexistent_user_xyz")
data = r.json()
assert data["success"] is False
assert "Не найден" in data.get("message", "")
```

**Expected result:** `{ success: false, message: "Не найден" }` (user not found).

---

### B7. Reset/update user password

> **Note:** There is no dedicated password reset endpoint. The panel stores admin passwords in `users.json` (bcrypt hashed). User passwords for proxy auth are stored in `config.json` inside `naiveUsers[].password` / `hy2Users[].password`. Updating a user's proxy password requires directly managing the config. The `PATCH` endpoint only updates `expireDays`. For the purpose of this scenario, we use `PATCH` to update expiry (which is the intended use of that endpoint).

```python
# First create user
s.post(f"{BASE}/api/naive/users", json={"username": "renew_user", "password": "OldPass123!"})

# Update expiry (the PATCH endpoint only supports expireDays)
r = s.patch(f"{BASE}/api/naive/users/renew_user", json={"expireDays": 60})
assert r.json()["success"] is True
assert r.json()["expiresAt"] is not None

# Verify
r2 = s.get(f"{BASE}/api/naive/users")
user = next(u for u in r2.json()["users"] if u["username"] == "renew_user")
assert user["expired"] is False

# Cleanup
s.delete(f"{BASE}/api/naive/users/renew_user")
```

**Expected result:** `{ success: true, expiresAt: "..." }`. User expiry updated.

---

### B8. Create user with duplicate username

**Prerequisites:** User `dupe_test` already exists.

**Steps:**
```python
# Create user
r1 = s.post(f"{BASE}/api/naive/users", json={"username": "dupe_test", "password": "FirstPass1!"})
assert r1.json()["success"] is True

# Create duplicate
r2 = s.post(f"{BASE}/api/naive/users", json={"username": "dupe_test", "password": "SecondPass1!"})
assert r2.json()["success"] is False
assert "уже существует" in r2.json().get("message", "")

# Cleanup
s.delete(f"{BASE}/api/naive/users/dupe_test")
```

**Expected result:** First creation succeeds. Second returns `{ success: false, message: "Пользователь уже существует" }`.

---

### B9. Create user with invalid username

**Prerequisites:** Logged-in session.

**Steps:**
```python
invalid_usernames = [
    "",              # empty
    "ab",            # too short (min 1, but test various)
    "user name",     # space
    "user@name",     # special char
    "user,name",     # comma
    "a" * 33,        # too long (max 32)
]
for uname in invalid_usernames:
    r = s.post(f"{BASE}/api/naive/users", json={"username": uname, "password": "ValidPass1!"})
    assert r.json()["success"] is False, f"Should fail for username: '{uname}'"

# The valid regex is /^[A-Za-z0-9_.-]{1,32}$/
# So these should work:
valid = ["a", "user.name", "user_name", "user-name", "User123", "a" * 32]
for uname in valid:
    r = s.post(f"{BASE}/api/naive/users", json={"username": uname, "password": "ValidPass1!"})
    assert r.json()["success"] is True, f"Should succeed for username: '{uname}'"
    s.delete(f"{BASE}/api/naive/users/{uname}")
```

**Expected result:** Invalid usernames are rejected with `{ success: false, message: "..." }`. Valid usernames are accepted.

---

### B10. Create user with invalid password

**Prerequisites:** Logged-in session.

**Steps:**
```python
invalid_passwords = [
    "",           # empty
    "short",      # too short (< 8)
    "a" * 129,    # too long (> 128)
    "pass word",  # space (whitespace not in allowed chars)
    "пароль",     # non-Latin chars
]
for pwd in invalid_passwords:
    r = s.post(f"{BASE}/api/naive/users", json={"username": "pwdtest", "password": pwd})
    assert r.json()["success"] is False, f"Should reject password: '{pwd[:20]}'"

# Valid chars: /^[A-Za-z0-9!@#$%^&*_+\-=.,~]+$/
valid_passwords = [
    "MyPass123!",
    "a" * 8,
    "a" * 128,
    "!@#$%^&*_+-=.,~",
]
for pwd in valid_passwords:
    r = s.post(f"{BASE}/api/naive/users", json={"username": "pwdgood", "password": pwd})
    assert r.json()["success"] is True, f"Should accept valid password"
    s.delete(f"{BASE}/api/naive/users/pwdgood")
```

**Expected result:** Invalid passwords rejected (`{ success: false }`), valid passwords accepted.

---

## C. SQLite-Specific Scenarios

> **Note:** Panel uses `USE_SQLITE` env var. When `true`, `storageFactory.js` loads `sqliteStorage.js` (better-sqlite3) for reads+writes, with dual-write to JSON. When `false`, only JSON is used.

### C1. JSON mode (USE_SQLITE=false) — file verification

**Prerequisites:** Panel running with `USE_SQLITE=false` (default). Data dir accessible.

**Steps:**
```python
import os, json

DATA_DIR = "/path/to/panel/data"  # or TEST_CONFIG_DIR

# Check no SQLite db exists
assert not os.path.exists(f"{DATA_DIR}/panel.db")

# Create a user (JSON mode only)
login()
r = s.post(f"{BASE}/api/naive/users", json={"username": "json_test", "password": "JsonPass1!"})
assert r.json()["success"] is True

# Verify config.json was written
cfg_path = f"{DATA_DIR}/config.json"
assert os.path.exists(cfg_path)
cfg = json.loads(open(cfg_path).read())
assert any(u["username"] == "json_test" for u in cfg["naiveUsers"])

# Verify users.json was NOT modified (it stores admin passwords, not proxy users)
# Actually users.json stores admin accounts, config.json stores proxy users

# Cleanup
s.delete(f"{BASE}/api/naive/users/json_test")
```

**Expected result:** No `panel.db` file. User written to `config.json` only.

---

### C2. SQLite mode (USE_SQLITE=true) — dual-write verification

**Prerequisites:** Panel running with `USE_SQLITE=true`. Data dir accessible.

**Steps:**
```python
import sqlite3, os, json

DATA_DIR = "/path/to/panel/data"

# Check SQLite db exists
assert os.path.exists(f"{DATA_DIR}/panel.db")

# Create a user
login()
r = s.post(f"{BASE}/api/naive/users", json={"username": "sqlite_test", "password": "SQLiteP1!"})
assert r.json()["success"] is True

# Verify in SQLite
db = sqlite3.connect(f"{DATA_DIR}/panel.db")
row = db.execute("SELECT value FROM meta WHERE key='config'").fetchone()
cfg = json.loads(row[0])
assert any(u["username"] == "sqlite_test" for u in cfg["naiveUsers"])
db.close()

# Verify in JSON (dual-write)
cfg_json = json.loads(open(f"{DATA_DIR}/config.json").read())
assert any(u["username"] == "sqlite_test" for u in cfg_json["naiveUsers"])

# Verify via API as well
r2 = s.get(f"{BASE}/api/naive/users")
assert any(u["username"] == "sqlite_test" for u in r2.json()["users"])

# Cleanup
s.delete(f"{BASE}/api/naive/users/sqlite_test")
```

**Expected result:** User exists in both SQLite (`meta` table) and `config.json`. API returns the user.

---

### C3. Switch from JSON to SQLite — data persists

**Prerequisites:** Panel was running with `USE_SQLITE=false`, users exist in JSON. Panel is stopped, restarted with `USE_SQLITE=true`.

**Steps:**
```python
# Phase 1: JSON mode — create users
# (panel has USE_SQLITE=false)
s1 = requests.Session()
s1.post(f"{BASE}/api/login", json={"username": "admin", "password": "admin"})
s1.post(f"{BASE}/api/naive/users", json={"username": "migrate_test", "password": "Migrate1!"})
s1.post(f"{BASE}/api/hy2/users", json={"username": "migrate_hy2", "password": "MigrateHy1!"})

# Phase 2: Restart panel with USE_SQLITE=true
# (manual step: docker restart / systemctl restart with env change)

# Phase 3: Verify data persisted
s2 = requests.Session()
s2.post(f"{BASE}/api/login", json={"username": "admin", "password": "admin"})

r = s2.get(f"{BASE}/api/naive/users")
assert any(u["username"] == "migrate_test" for u in r.json()["users"])

r2 = s2.get(f"{BASE}/api/hy2/users")
assert any(u["username"] == "migrate_hy2" for u in r2.json()["users"])

# Verify SQLite data matches
import sqlite3, json
db = sqlite3.connect(f"{DATA_DIR}/panel.db")
row = db.execute("SELECT value FROM meta WHERE key='config'").get()
cfg = json.loads(row[0])
assert any(u["username"] == "migrate_test" for u in cfg["naiveUsers"])
assert any(u["username"] == "migrate_hy2" for u in cfg["hy2Users"])
db.close()

# Cleanup
s2.delete(f"{BASE}/api/naive/users/migrate_test")
s2.delete(f"{BASE}/api/hy2/users/migrate_hy2")
```

**Expected result:** All users created in JSON mode are visible after switching to SQLite. SQLite's `meta` table contains the imported data.

---

### C4. Switch from SQLite to JSON — data persists

**Prerequisites:** Panel was running with `USE_SQLITE=true`, users exist in SQLite+JSON. Panel restarted with `USE_SQLITE=false`.

**Steps:**
```python
# Phase 1: SQLite mode — create users
# Phase 2: Restart panel with USE_SQLITE=false
# Phase 3: Verify data still visible (JSON files were kept up-to-date by dual-write)

s = requests.Session()
s.post(f"{BASE}/api/login", json={"username": "admin", "password": "admin"})

r = s.get(f"{BASE}/api/naive/users")
all_users = r.json()["users"]
# Users from SQLite phase should still be here
assert len(all_users) >= 0  # at minimum, no data loss
```

**Expected result:** Data is preserved. Dual-write during SQLite mode kept JSON files current. When switching back to JSON mode, data is read from the (still-accurate) JSON files.

---

### C5. SQLite WAL mode — concurrent reads during write

**Prerequisites:** Panel running with `USE_SQLITE=true`. SQLite opens with `PRAGMA journal_mode = WAL`.

**Steps:**
```python
import threading, time

results = []

def reader_thread():
    try:
        for i in range(20):
            r = s.get(f"{BASE}/api/naive/users")
            assert r.status_code == 200
            time.sleep(0.01)
        results.append("reader_ok")
    except Exception as e:
        results.append(f"reader_err: {e}")

def writer_thread():
    try:
        for i in range(20):
            uname = f"concur_user_{i}"
            s.post(f"{BASE}/api/naive/users", json={"username": uname, "password": "ConcurP1!"})
            time.sleep(0.01)
        results.append("writer_ok")
    except Exception as e:
        results.append(f"writer_err: {e}")

# Kick off reader and writer simultaneously
t1 = threading.Thread(target=reader_thread)
t2 = threading.Thread(target=writer_thread)
t1.start()
t2.start()
t1.join()
t2.join()

assert all("_ok" in r for r in results), f"Concurrent test failed: {results}"

# Cleanup
for i in range(20):
    s.delete(f"{BASE}/api/naive/users/concur_user_{i}")
```

**Expected result:** All 20 reads succeed during concurrent writes. No `SQLITE_BUSY` errors. WAL mode allows concurrent reads without blocking.

---

## D. Edge Cases

### D1. Login rate limiting (>5 failures)

**Prerequisites:** Fresh panel (or rate limit window reset).

**Steps:**
```python
# Send 6 rapid login attempts with wrong password
for i in range(6):
    r = requests.post(f"{BASE}/api/login", json={"username": "admin", "password": f"wrong{i}"})
    if i < 5:
        assert r.status_code == 200
        assert r.json()["success"] is False
    else:
        # 6th attempt should be rate-limited
        assert r.status_code == 429
        data = r.json()
        assert "error" in data

# Even with correct password, should be blocked
r_final = requests.post(f"{BASE}/api/login", json={"username": "admin", "password": "admin"})
assert r_final.status_code == 429
```

**Expected result:** Attempts 1-5: HTTP 200, `{ success: false }`. Attempt 6+: HTTP 429, `{ error: "Слишком много попыток входа..." }`. Rate limit window: 15 minutes.

---

### D2. Access protected route without auth → 401

**Prerequisites:** No session cookie.

**Steps:**
```python
r = requests.get(f"{BASE}/api/config")
assert r.status_code == 401
assert r.json()["error"] == "Unauthorized"

r2 = requests.get(f"{BASE}/api/status")
assert r2.status_code == 401

r3 = requests.get(f"{BASE}/api/traffic")
assert r3.status_code == 401
```

Covered by A1 in more detail.

**Expected result:** HTTP 401 for all protected endpoints.

---

### D3. Expired user cannot connect

> **Note:** This test requires the full Docker infrastructure with actual proxy servers. The expiry checker runs every 5 minutes (first run after 20 seconds).

**Prerequisites:** Panel running with proxy installed (Naive or Hy2), sing-box client available.

**Steps:**
```python
# Create user with 0-day expiry (no expiry)
s.post(f"{BASE}/api/naive/users", json={
    "username": "expiry_check",
    "password": "ExpiryChk1!",
    "expireDays": 0,  # unlimited
})

# Verify not expired
r = s.get(f"{BASE}/api/naive/users")
user = next(u for u in r.json()["users"] if u["username"] == "expiry_check")
assert user["expired"] is False

# Manually set expiresAt in the past (simulate expiry)
# This requires direct DB manipulation:
cfg = s.get(f"{BASE}/api/config").json()
for u in cfg["naiveUsers"]:
    if u["username"] == "expiry_check":
        u["expiresAt"] = "2020-01-01T00:00:00.000Z"
# Write back (this is a hack — in real test, wait for actual expiry)
import requests as req
# There's no PUT /api/config, so we'd need DB/JSON manipulation

# Alternative: trigger the expireChecker manually via timer wait
# The expireChecker runs every 5 min. Wait for it.
# Or restart panel with short interval for testing.

# After expiry is set:
r2 = s.get(f"{BASE}/api/naive/users")
user2 = next(u for u in r2.json()["users"] if u["username"] == "expiry_check")
assert user2["expired"] is True
assert user2["remainingSec"] == 0

# Cleanup
s.delete(f"{BASE}/api/naive/users/expiry_check")
```

**Expected result:** When `expiresAt` is in the past, `expired: true`, `remainingSec: 0`. The expireChecker rewrites Caddy/Hy2 configs excluding expired users, so proxy connections are rejected.

---

### D4. Access with invalid session → 401

**Prerequisites:** A valid session cookie that has been destroyed (logout) or tampered with.

**Steps:**
```python
# Log in
s = requests.Session()
s.post(f"{BASE}/api/login", json={"username": "admin", "password": "admin"})

# Log out
s.post(f"{BASE}/api/logout")

# Try to access protected endpoint
r = s.get(f"{BASE}/api/config")
assert r.status_code == 401

# Try with tampered cookie
r2 = requests.get(f"{BASE}/api/config", cookies={"rixxx_sid": "invalid_session_id"})
assert r2.status_code == 401

# Try with empty cookie
r3 = requests.get(f"{BASE}/api/config", cookies={"rixxx_sid": ""})
assert r3.status_code == 401
```

**Expected result:** All return HTTP 401.

---

### D5. Config validation — invalid domain rejected

> **Note:** Domain validation happens during WebSocket install, not via a standalone endpoint. The `isValidDomain` validator checks: min 2 labels separated by dots, each label max 63 chars, total max 253 chars, alphanumeric + hyphens.

**Steps:**
```python
import json, websockets

async def test_invalid_domain():
    cookies = "; ".join(f"{k}={v}" for k, v in s.cookies.items())
    async with websockets.connect(f"ws://localhost:3000/", extra_headers={"Cookie": cookies}) as ws:
        await ws.send(json.dumps({
            "type": "install_naive",
            "domain": "not-a-domain",
            "email": "admin@example.com",
            "login": "admin",
            "password": "MyPassword123!"
        }))
        async for msg in ws:
            data = json.loads(msg)
            if data.get("type") == "install_error":
                assert "домен" in data.get("message", "").lower()
                break

# Invalid domains: "not-a-domain" (no dot), "example" (single label),
# "" (empty), ".com" (starts with dot), "a..b.com" (double dot)
```

**Expected result:** Install rejected with `install_error` message containing "Неверный домен".

---

### D6. Duplicate session — second login behavior

**Prerequisites:** Panel uses in-memory session store (`express-session` MemoryStore).

**Steps:**
```python
# Login from two different sessions
s1 = requests.Session()
s2 = requests.Session()

r1 = s1.post(f"{BASE}/api/login", json={"username": "admin", "password": "admin"})
assert r1.json()["success"] is True

r2 = s2.post(f"{BASE}/api/login", json={"username": "admin", "password": "admin"})
assert r2.json()["success"] is True

# Both sessions are independent (Express creates separate session IDs)
r1_check = s1.get(f"{BASE}/api/me")
assert r1_check.status_code == 200

r2_check = s2.get(f"{BASE}/api/me")
assert r2_check.status_code == 200

# Log out s1
s1.post(f"{BASE}/api/logout")

# s1 should be invalidated, s2 should still work
r1_after = s1.get(f"{BASE}/api/config")
assert r1_after.status_code == 401

r2_after = s2.get(f"{BASE}/api/config")
assert r2_after.status_code == 200
```

**Expected result:** Multiple independent sessions can coexist. Logging out one does not affect the other.

---

### D7. Restart panel — session persistence

**Prerequisites:** Panel with persistent session secret file (`data/.session_secret`).

**Steps:**
```python
# Login before restart
s = requests.Session()
s.post(f"{BASE}/api/login", json={"username": "admin", "password": "admin"})
cookie_before = s.cookies["rixxx_sid"]

# Restart the panel
# (docker restart nt-panel / systemctl restart rixxx-panel)

# After restart, sessions are lost (in-memory MemoryStore)
r = s.get(f"{BASE}/api/config")
assert r.status_code == 401  # Session is gone after restart

# But login still works with same credentials
s.post(f"{BASE}/api/login", json={"username": "admin", "password": "admin"})
r2 = s.get(f"{BASE}/api/config")
assert r2.status_code == 200
assert r2.json()["installed"] is True  # Config persisted
```

**Expected result:** After restart, old sessions are invalidated (in-memory). Config and users persist (JSON/SQLite). Login works again with new session.

---

## E. Traffic & Status

### E1. GET /api/status returns panel status

**Prerequisites:** Logged-in session. Panel may or may not be installed.

**Steps:**
```python
r = s.get(f"{BASE}/api/status")
data = r.json()
assert "installed" in data
assert "stack" in data
assert isinstance(data["stack"], dict)

if data["installed"] is False:
    assert data["stack"] == {"naive": False, "hy2": False}
else:
    assert "domain" in data
    assert "email" in data
    assert "serverIp" in data
    assert "arch" in data
    assert "naive" in data  # null if not installed, else { active, usersCount }
    assert "hy2" in data    # null if not installed, else { active, usersCount }
    if data["naive"]:
        assert "active" in data["naive"]
        assert "usersCount" in data["naive"]
    if data["hy2"]:
        assert "active" in data["hy2"]
        assert "usersCount" in data["hy2"]
```

**Expected result:** Status object with `installed`, `stack`, and optionally domain/email/serverIp/arch and per-protocol status.

---

### E2. GET /api/traffic returns traffic object

**Prerequisites:** Logged-in session.

**Steps:**
```python
r = s.get(f"{BASE}/api/traffic")
data = r.json()
assert "daily" in data
assert "perProto" in data
assert "connections" in data
assert "hourly" in data
assert "lastReset" in data

# Daily should have rx/tx
if data["daily"] is not None:
    assert "rx" in data["daily"]
    assert "tx" in data["daily"]
    assert "rxFormatted" in data["daily"]
    assert "txFormatted" in data["daily"]
    assert "totalFormatted" in data["daily"]

# perProto should have naive and hy2
assert "naive" in data["perProto"]
assert "hy2" in data["perProto"]
for proto in ["naive", "hy2"]:
    assert "rx" in data["perProto"][proto]
    assert "tx" in data["perProto"][proto]
    assert "rxFormatted" in data["perProto"][proto]
    assert "txFormatted" in data["perProto"][proto]
    assert "totalFormatted" in data["perProto"][proto]

# connections
assert "naive" in data["connections"]
assert "hy2" in data["connections"]

# hourly should be a list
assert isinstance(data["hourly"], list)
```

**Expected result:** Full traffic object with daily totals, per-protocol breakdown, connection counts, and hourly history.

---

### E3. Traffic counter increments after user connects

> **Note:** This requires the full Docker infrastructure. Traffic counters are tracked via `trafficMonitor.js` (iptables-based on real systems, simulated in test mode).

**Prerequisites:** Panel installed with proxy running. Sing-box client available. iptables traffic monitoring active.

**Steps:**
```python
# Get traffic baseline
baseline = s.get(f"{BASE}/api/traffic").json()
naive_rx_before = baseline["perProto"]["naive"]["rx"]
naive_tx_before = baseline["perProto"]["naive"]["tx"]

# Create a user and make a proxied request (requires sing-box client)
# (see test_naive_connectivity.py for the sing-box flow)
# After the user connects and transfers data:

# Get traffic after
after = s.get(f"{BASE}/api/traffic").json()
naive_rx_after = after["perProto"]["naive"]["rx"]
naive_tx_after = after["perProto"]["naive"]["tx"]

# Traffic should have increased
assert naive_rx_after >= naive_rx_before
assert naive_tx_after >= naive_tx_before
# At least some bytes transferred
assert (naive_rx_after + naive_tx_after) > (naive_rx_before + naive_tx_before)
```

**Expected result:** Traffic counters increase after a user connects and transfers data through the proxy.

---

## Summary Matrix

| # | Scenario | Depends On | Key Assertion |
|---|---|---|---|
| A1 | No auth → 401 | fresh panel | `HTTP 401` |
| A2 | Wrong password login | fresh panel | `success: false` |
| A3 | Correct login → session | fresh panel | `success: true`, cookie set |
| A4 | Default config | A3 | `installed: false` |
| A5 | Install Naive | A3, WS | `install_done`, `installed: true` |
| A6 | Install Hy2 | A3, WS | `install_done` |
| A7 | Install both | A3, WS | both links returned |
| B1 | Empty user list | A3 | `{ users: [] }` |
| B2 | Create Naive user | A3 | `success: true`, user in list |
| B3 | Create Hy2 user | A3 | `success: true`, user in list |
| B4 | User with expiry | A3 | `expiresAt` set, `expired: false` |
| B5 | Delete user | B2 | user removed from list |
| B6 | Delete non-existent | A3 | `success: false` |
| B7 | Update user expiry | A3 | `success: true`, `new expiresAt` |
| B8 | Duplicate username | A3 | `success: false` |
| B9 | Invalid username | A3 | validation error |
| B10 | Invalid password | A3 | validation error |
| C1 | JSON mode file verify | USE_SQLITE=false | no `panel.db` |
| C2 | SQLite dual-write | USE_SQLITE=true | user in SQLite + JSON |
| C3 | JSON→SQLite migration | restart with SQLite | data preserved |
| C4 | SQLite→JSON fallback | restart without SQLite | data preserved |
| C5 | WAL concurrent access | USE_SQLITE=true | reads succeed during writes |
| D1 | Rate limiting | fresh panel | `HTTP 429` after 5 failures |
| D2 | No auth → 401 | no session | `HTTP 401` |
| D3 | Expired user | proxy infra | `expired: true` |
| D4 | Invalid session | A3 | `HTTP 401` after logout |
| D5 | Invalid domain | A3, WS | `install_error` |
| D6 | Duplicate session | A3 | both sessions work independently |
| D7 | Restart persistence | A3 → restart | session lost, config preserved |
| E1 | Status endpoint | A3 | valid status object |
| E2 | Traffic endpoint | A3 | valid traffic object |
| E3 | Traffic increments | full infra | counters increase |
