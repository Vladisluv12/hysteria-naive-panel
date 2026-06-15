# Integration Tests Expansion — Design

**Date:** 2026-06-15
**Status:** approved

## Overview

Expand integration test coverage from 17 to ~32 tests by adding scenarios C1-C5 (SQLite), D3 (expired user), D5 (WebSocket validation), D7 (restart persistence), E3 (traffic increments). Install scenarios (A5-A7) remain out of scope.

## Docker Infrastructure

### docker-compose.yml additions

Add `panel-sqlite` service — identical to `panel` but with `USE_SQLITE=true`, on port 3001, with its own data volume:

```yaml
panel-sqlite:
  build:
    context: ../../../
    dockerfile: tests/integration/docker/panel/Dockerfile
  container_name: nt-panel-sqlite
  ports:
    - "3001:3000"
  environment:
    NODE_ENV: production
    PORT: 3000
    LISTEN_HOST: 0.0.0.0
    TEST_MODE: "1"
    USE_SQLITE: "true"
    TEST_CONFIG_DIR: /config-share
  volumes:
    - panel-data-sqlite:/app/data
    - proxy-config-share:/config-share
  depends_on:
    caddy-naive:
      condition: service_started
  networks:
    - testnet
  healthcheck:
    test: ["CMD", "nc", "-z", "127.0.0.1", "3000"]
    interval: 5s
    timeout: 5s
    retries: 10
    start_period: 15s

volumes:
  panel-data:          # existing
  panel-data-sqlite:   # new
```

### conftest.py additions

1. **`panel_sqlite_api` fixture** (session-scoped) — logged-in PanelClient on port 3001
2. **`docker_panel_control` fixture** (session-scoped) — module with functions:
   - `stop_panel()` — `docker stop nt-panel`
   - `start_panel(env_vars=None)` — `docker start nt-panel` + optional env override
   - `restart_panel(env_vars=None)` — stop + start
   - `wait_panel_ready(timeout=30)` — poll `GET /api/login` until 200

C3/C4 tests use this fixture.

## New Test Files

### 1. `tests/test_sqlite_scenarios.py` — 5 tests (C1-C5)

**C1 — JSON mode: no panel.db**
- Use `panel_api` (port 3000, no USE_SQLITE)
- Create a user
- Exec into container, verify `panel.db` does NOT exist
- Verify user in config.json

**C2 — SQLite dual-write**
- Use `panel_sqlite_api` (port 3001, USE_SQLITE=true)
- Create a user
- Exec into container, verify user exists in SQLite `meta` table AND in `config.json` (dual-write)
- Verify via API

**C3 — JSON→SQLite migration**
- Phase 1: Use `panel_api` (3000), create users
- Phase 2: `docker_panel_control.restart_panel(env_vars={"USE_SQLITE": "true"})`
- Phase 3: Verify users exist via API AND in SQLite

**C4 — SQLite→JSON fallback**
- Phase 1: `docker_panel_control.restart_panel(env_vars={"USE_SQLITE": "true"})`, create users
- Phase 2: `docker_panel_control.restart_panel(env_vars={"USE_SQLITE": "false"})`
- Phase 3: Verify users still in API → JSON preserved by dual-write

**C5 — WAL concurrent access**
- Use `panel_sqlite_api` (3001)
- Launch reader thread (20 GET /api/naive/users) + writer thread (20 POST create users) simultaneously
- All requests succeed without SQLITE_BUSY errors

### 2. `tests/test_edge_scenarios.py` — 4 tests (D3, D5, D7, E3)

**D3 — Expired user marked as expired**
- Use `panel_api`
- Create user with normal expiry
- Write `expiresAt` to a past date directly into config.json via `docker exec`
- Wait for expireChecker (fires at 20s after panel start, then every 5min)
- Verify GET/naive/users shows `expired: true`, `remainingSec: 0`

**D5 — Invalid domain via WebSocket**
- Use `panel_api`
- Open WebSocket connection to `ws://localhost:3000/` with session cookie
- Send `{type: "install_naive", domain: "not-a-domain", ...}`
- Receive `install_error` with domain-related message

**D7 — Panel restart: session lost, config preserved**
- Login with fresh client, grab session cookie
- `docker restart nt-panel` + wait
- Old session returns 401
- New login works
- Config matches pre-restart state

**E3 — Traffic counters increment**
- Record baseline traffic counters via `/api/traffic`
- Make a real HTTP request through Naive proxy (curl via Caddy)
- Record traffic counters again
- Assert sum(rx+tx) increased

## Dependencies

Add to `tests/integration/requirements.txt`:
```
websockets>=12.0
```

The `websockets` library is needed for D5 (WebSocket install validation test).

## No changes to panel source code

SQLite is already an `optionalDependency` in `package.json`. The Dockerfile already has `python3 make g++` for native module compilation. `USE_SQLITE` env var is already handled by `storageFactory.js`. No source changes needed.

## Not Covered

- A5-A7 (Install): requires real domain, external network, install scripts — out of scope
- D1 (rate limiting 429): rate limiter set to 1000 in TEST_MODE, too high to trigger. Rate limiter logic tested by panel unit tests.
