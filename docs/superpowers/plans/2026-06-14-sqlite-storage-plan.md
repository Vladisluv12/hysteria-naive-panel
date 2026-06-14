# SQLite Storage Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional SQLite storage backend for the panel, switchable via `USE_SQLITE` env variable with dual-write data safety.

**Architecture:** `sqliteStorage.js` (SQLite CRUD) + `storageFactory.js` (selects backend by `USE_SQLITE`). `storageFactory` wraps dual-write: when SQLite active, every write goes to both SQLite and JSON. All existing consumers swap their import from `storage.js` to `storageFactory.js`.

**Tech Stack:** Node.js, better-sqlite3 (synchronous native addon), existing JSON storage untouched.

---

## File Structure

| File | Status | Purpose |
|------|--------|---------|
| `panel/server/services/sqliteStorage.js` | **Create** | SQLite backend (loadConfig/saveConfig/loadUsers/saveUsers/defaultConfig) |
| `panel/server/services/storageFactory.js` | **Create** | Backend selection + dual-write |
| `panel/server/__tests__/sqliteStorage.test.js` | **Create** | Tests for sqliteStorage |
| `panel/package.json` | **Modify** | Add `better-sqlite3` dependency |
| `panel/server/index.js` | **Modify** | Import from storageFactory instead of storage.js |
| `panel/server/services/atomicUpdate.js` | **Modify** | Import from storageFactory |
| `panel/server/controllers/authController.js` | **Modify** | Import from storageFactory |
| `panel/server/controllers/naiveController.js` | **Modify** | Import from storageFactory |
| `panel/server/controllers/hysteriaController.js` | **Modify** | Import from storageFactory |
| `panel/server/controllers/systemController.js` | **Modify** | Import from storageFactory |
| `panel/server/controllers/diagController.js` | **Modify** | Import from storageFactory |
| `install.sh` | **Modify** | SQLite question + systemd env |

---

### Task 1: Add better-sqlite3 dependency

**Files:**
- Modify: `panel/package.json`

- [ ] **Step 1: Add better-sqlite3 to dependencies**

```json
"dependencies": {
  "better-sqlite3": "^11.0.0",
  // ... existing deps stay unchanged
}
```

- [ ] **Step 2: Install and verify**

Run: `cd panel && npm install 2>&1`
Expected: `better-sqlite3` is installed. Check `node_modules/better-sqlite3` exists.

- [ ] **Step 3: Commit**

```bash
git add panel/package.json panel/package-lock.json
git commit -m "feat: add better-sqlite3 dependency"
```

---

### Task 2: Implement sqliteStorage.js with TDD

**Files:**
- Create: `panel/server/services/sqliteStorage.js`
- Test: `panel/server/__tests__/sqliteStorage.test.js`

**API (identical to storage.js):**
```js
function defaultConfig()  // → { installed: false, stack: { naive: false, hy2: false }, domain: '', ... }
function loadConfig()     // → object (парсит JSON из SQLite)
function saveConfig(cfg)  // void (INSERT OR REPLACE в SQLite)
function loadUsers()      // → { username: { password, role } }
function saveUsers(usr)   // void
```

**Internals:** Одна таблица `meta (key TEXT PK, value TEXT)`. Два ключа: `'config'`, `'users'`.

**На уровне модуля (при первом require):**
1. `better-sqlite3` → открыть `path.join(__dirname, '../../data/panel.db')`, WAL mode
2. `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
3. Если SQLite пуст (`SELECT COUNT(*) FROM meta` = 0), а JSON-файлы существуют — импорт:
   - `fs.readFileSync(CONFIG_FILE)` → `INSERT INTO meta VALUES ('config', ...)`
   - `fs.readFileSync(USERS_FILE)` → `INSERT INTO meta VALUES ('users', ...)`
4. `defaultConfig` возвращает тот же объект что и `storage.defaultConfig`

- [ ] **Step 1: Write the failing tests**

`panel/server/__tests__/sqliteStorage.test.js`:

```js
'use strict';

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'panel.db');

afterAll(() => {
  try { fs.unlinkSync(DB_PATH); } catch {}
});

describe('sqliteStorage', () => {
  test('exports all required functions', async () => {
    const mod = await import('../services/sqliteStorage.js');
    expect(mod.defaultConfig).toBeDefined();
    expect(mod.loadConfig).toBeDefined();
    expect(mod.saveConfig).toBeDefined();
    expect(mod.loadUsers).toBeDefined();
    expect(mod.saveUsers).toBeDefined();
  });

  test('defaultConfig returns initial state', async () => {
    const mod = await import('../services/sqliteStorage.js');
    const cfg = mod.defaultConfig();
    expect(cfg.installed).toBe(false);
    expect(cfg.stack).toEqual({ naive: false, hy2: false });
    expect(cfg.naiveUsers).toEqual([]);
    expect(cfg.hy2Users).toEqual([]);
  });

  test('saveConfig / loadConfig roundtrip', async () => {
    const mod = await import('../services/sqliteStorage.js');
    const data = { installed: true, domain: 'test.com', stack: { naive: true, hy2: false }, naiveUsers: [], hy2Users: [] };
    mod.saveConfig(data);
    const loaded = mod.loadConfig();
    expect(loaded.domain).toBe('test.com');
    expect(loaded.installed).toBe(true);
    expect(loaded.stack.naive).toBe(true);
  });

  test('saveUsers / loadUsers roundtrip', async () => {
    const mod = await import('../services/sqliteStorage.js');
    const users = { admin: { password: '$2a$10$xxx', role: 'admin' }, test: { password: 'hash', role: 'user' } };
    mod.saveUsers(users);
    const loaded = mod.loadUsers();
    expect(loaded.admin.role).toBe('admin');
    expect(loaded.test.role).toBe('user');
  });

  test('loadConfig after multiple saves returns latest', async () => {
    const mod = await import('../services/sqliteStorage.js');
    mod.saveConfig({ installed: true, domain: 'v1.com', stack: { naive: true, hy2: false }, naiveUsers: [], hy2Users: [] });
    mod.saveConfig({ installed: true, domain: 'v2.com', stack: { naive: true, hy2: true }, naiveUsers: [], hy2Users: [] });
    const loaded = mod.loadConfig();
    expect(loaded.domain).toBe('v2.com');
    expect(loaded.stack.hy2).toBe(true);
  });

  test('imports from JSON when SQLite is empty', async () => {
    // Удалить БД, создать config.json и users.json
    try { fs.unlinkSync(DB_PATH); } catch {}
    const cfgData = { installed: true, domain: 'imported.com', stack: { naive: true, hy2: false }, naiveUsers: [], hy2Users: [] };
    const usrData = { admin: { password: 'hash', role: 'admin' } };
    fs.writeFileSync(path.join(DATA_DIR, 'config.json'), JSON.stringify(cfgData));
    fs.writeFileSync(path.join(DATA_DIR, 'users.json'), JSON.stringify(usrData));

    // Перезагрузить модуль (сбросить кеш require)
    delete require.cache[require.resolve('../services/sqliteStorage.js')];
    const mod = await import('../services/sqliteStorage.js');
    expect(mod.loadConfig().domain).toBe('imported.com');
    expect(mod.loadUsers().admin.role).toBe('admin');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd panel && npx vitest run server/__tests__/sqliteStorage.test.js 2>&1`
Expected: FAIL — module not found (sqliteStorage.js doesn't exist yet)

- [ ] **Step 3: Write sqliteStorage.js**

`panel/server/services/sqliteStorage.js`:

```js
'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'panel.db');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let db;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.prepare('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();

  // Import from JSON if SQLite is empty
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM meta').get().cnt;
  if (count === 0) {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const cfg = fs.readFileSync(CONFIG_FILE, 'utf8');
        db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('config', cfg);
      }
    } catch (e) {
      console.error('[sqliteStorage] import config.json failed:', e.message);
    }
    try {
      if (fs.existsSync(USERS_FILE)) {
        const usr = fs.readFileSync(USERS_FILE, 'utf8');
        db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('users', usr);
      }
    } catch (e) {
      console.error('[sqliteStorage] import users.json failed:', e.message);
    }
  }
} catch (e) {
  console.error('[sqliteStorage] failed to open database:', e.message);
  process.exit(1);
}

function defaultConfig() {
  return {
    installed: false,
    stack: { naive: false, hy2: false },
    domain: '',
    email: '',
    serverIp: '',
    arch: '',
    naiveUsers: [],
    hy2Users: []
  };
}

function loadConfig() {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'config'").get();
  if (!row) return defaultConfig();
  try {
    return JSON.parse(row.value);
  } catch (e) {
    console.error('[sqliteStorage] config parse error:', e.message);
    return defaultConfig();
  }
}

function saveConfig(cfg) {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('config', JSON.stringify(cfg));
}

function loadUsers() {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'users'").get();
  if (!row) return {};
  try {
    return JSON.parse(row.value);
  } catch (e) {
    console.error('[sqliteStorage] users parse error:', e.message);
    return {};
  }
}

function saveUsers(users) {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('users', JSON.stringify(users));
}

module.exports = { defaultConfig, loadConfig, saveConfig, loadUsers, saveUsers };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd panel && npx vitest run server/__tests__/sqliteStorage.test.js 2>&1`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add panel/server/services/sqliteStorage.js panel/server/__tests__/sqliteStorage.test.js
git commit -m "feat: add sqliteStorage.js with dual-read/write and JSON import"
```

---

### Task 3: Implement storageFactory.js

**Files:**
- Create: `panel/server/services/storageFactory.js`

**Logic:**
- Если `process.env.USE_SQLITE === 'true'` → `saveConfig` пишет в SQLite + JSON (dual-write), `loadConfig` читает из SQLite
- Если `USE_SQLITE` не true → делегирует `storage.js` (чистый JSON)

- [ ] **Step 1: Write storageFactory.js**

```js
'use strict';

const storage = require('./storage.js');

let sqliteStorage = null;
if (process.env.USE_SQLITE === 'true') {
  try {
    sqliteStorage = require('./sqliteStorage.js');
    console.log('[storage] SQLite backend active');
  } catch (e) {
    console.error('[storage] Failed to load sqliteStorage, falling back to JSON:', e.message);
  }
}

function defaultConfig() {
  return storage.defaultConfig();
}

function loadConfig() {
  if (sqliteStorage) return sqliteStorage.loadConfig();
  return storage.loadConfig();
}

function saveConfig(cfg) {
  if (sqliteStorage) sqliteStorage.saveConfig(cfg);
  storage.saveConfig(cfg); // always write JSON
}

function loadUsers() {
  if (sqliteStorage) return sqliteStorage.loadUsers();
  return storage.loadUsers();
}

function saveUsers(users) {
  if (sqliteStorage) sqliteStorage.saveUsers(users);
  storage.saveUsers(users); // always write JSON
}

module.exports = { defaultConfig, loadConfig, saveConfig, loadUsers, saveUsers };
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `cd panel && npx vitest run 2>&1`
Expected: All tests pass (storageFactory isn't imported by existing code yet)

- [ ] **Step 3: Commit**

```bash
git add panel/server/services/storageFactory.js
git commit -m "feat: add storageFactory.js with USE_SQLITE backend selection"
```

---

### Task 4: Swap all imports from storage.js → storageFactory.js

**Files:**
- Modify: `panel/server/index.js`
- Modify: `panel/server/services/atomicUpdate.js`
- Modify: `panel/server/controllers/authController.js`
- Modify: `panel/server/controllers/naiveController.js`
- Modify: `panel/server/controllers/hysteriaController.js`
- Modify: `panel/server/controllers/systemController.js`
- Modify: `panel/server/controllers/diagController.js`

**Pattern:** Every `require('../services/storage.js')` → `require('../services/storageFactory.js')`, except:
- `storageFactory.js` itself still uses `require('./storage.js')` internally (kept)
- `sqliteStorage.js` still uses `require('./storage.js')`-level fs paths for JSON import (kept)

- [ ] **Step 1: Update index.js**

```js
// line 58: change from:
const { loadConfig, saveConfig, loadUsers, saveUsers, defaultConfig } = require('./services/storage.js');
// to:
const { loadConfig, saveConfig, loadUsers, saveUsers, defaultConfig } = require('./services/storageFactory.js');
```

- [ ] **Step 2: Update atomicUpdate.js**

```js
// line 3: change from:
const { loadConfig, saveConfig, loadUsers, saveUsers } = require('./storage.js');
// to:
const { loadConfig, saveConfig, loadUsers, saveUsers } = require('./storageFactory.js');
```

Wait, the path from `services/atomicUpdate.js` to `services/storageFactory.js` is `./storageFactory.js` since they're in the same directory.

- [ ] **Step 3: Update authController.js**

```js
// line 4: from:
const { loadUsers, saveUsers } = require('../services/storage.js');
// to:
const { loadUsers, saveUsers } = require('../services/storageFactory.js');
```

- [ ] **Step 4: Update naiveController.js**

```js
// line 4: from:
const { loadConfig } = require('../services/storage.js');
// to:
const { loadConfig } = require('../services/storageFactory.js');
```

- [ ] **Step 5: Update hysteriaController.js**

```js
// line 6: from:
const { loadConfig } = require('../services/storage.js');
// to:
const { loadConfig } = require('../services/storageFactory.js');
```

- [ ] **Step 6: Update systemController.js**

```js
// line 4: from:
const { loadConfig } = require('../services/storage.js');
// to:
const { loadConfig } = require('../services/storageFactory.js');
```

- [ ] **Step 7: Update diagController.js**

```js
// line 6: from:
const { loadConfig } = require('../services/storage.js');
// to:
const { loadConfig } = require('../services/storageFactory.js');
```

- [ ] **Step 8: Run all tests to verify everything works**

Run: `cd panel && rm -rf data && npx vitest run 2>&1`
Expected: All 72 unit tests PASS

- [ ] **Step 9: Commit**

```bash
git add panel/server/index.js panel/server/services/atomicUpdate.js panel/server/controllers/
git commit -m "refactor: swap storage.js imports to storageFactory.js across all controllers"
```

---

### Task 5: Integration tests — verify SQLite backend end-to-end

**Files:**
- Test: `tests/integration/tests/` (new test or existing)

- [ ] **Step 1: Add a SQLite integration test case**

Add to `tests/integration/tests/test_user_lifecycle.py` or create `tests/integration/tests/test_sqlite_storage.py`:

Actually — integration tests run against Docker containers with `USE_SQLITE` not set. Adding a separate Docker test suite for SQLite mode is out of scope for this task. The SQLite backend is validated by unit tests (`sqliteStorage.test.js`). The existing integration tests already validate that the panel API works correctly with JSON storage (status quo).

No new integration test needed for now.

- [ ] **Step 2: Verify integration tests still pass**

Run: `cd tests/integration && bash run.sh 2>&1`
Expected: All 17 integration tests PASS

---

### Task 6: Install script — SQLite prompt

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Add SQLite question after protocol selection**

```bash
# После выбора протоколов, перед установкой зависимостей:

echo ""
echo -e "${CYAN}${BOLD}▶ Хранилище данных${RESET}"
echo -e "${BLUE}SQLite обеспечивает транзакционность и целостность данных."
echo -e "JSON-файлы — минимум зависимостей, но без транзакций.${RESET}"
echo ""
read -r -p "$(echo -e ${GREEN}"Использовать SQLite? [Y/n]: "${RESET})" USE_SQLITE_ANSWER
USE_SQLITE_ANSWER="${USE_SQLITE_ANSWER:-Y}"
if [[ "$USE_SQLITE_ANSWER" =~ ^[YyДд] ]]; then
  USE_SQLITE=true
else
  USE_SQLITE=false
fi
```

- [ ] **Step 2: Add USE_SQLITE env to systemd service**

```bash
# В секции [Service] systemd unit:
Environment=NODE_ENV=production
Environment=USE_SQLITE=${USE_SQLITE}
```

- [ ] **Step 3: Verify the install script path**

The install script is at `/home/vladozz/Рабочий стол/network/naive+tuic_proxy/install.sh`. It copies itself to the target server. The SQLite question and systemd env injection should be added just before the pm2/service setup section.

---

## Self-Review

**Spec coverage:**
1. ✅ SQLite backend (`sqliteStorage.js`) — Task 2
2. ✅ Factory with USE_SQLITE env — Task 3
3. ✅ Dual-write (SQLite + JSON) — Task 3 (storageFactory does both writes)
4. ✅ Первое включение: импорт из JSON — Task 2 (module-level import)
5. ✅ Install script вопрос + systemd env — Task 6
6. ✅ All existing tests pass — Task 4, 5

**Placeholder scan:** No TBDs, TODOs, or vague instructions. All code is explicit.

**Type consistency:** All functions use the same signatures as `storage.js`. `defaultConfig`, `loadConfig`, `saveConfig`, `loadUsers`, `saveUsers` — consistent across all files.
