# ARCHITECTURE.md — RIXXX Panel (Naive + Hysteria2)

## System Overview

RIXXX Panel is a web-based management interface for NaiveProxy and Hysteria2 proxy services. It provides a React frontend for managing users, viewing diagnostics, and controlling proxy services running on a VPS.

**Stack:**
- Frontend: React 19 + TypeScript + Vite
- Backend: Express.js + Node.js 20+
- Process Manager: PM2
- Proxy Services: NaiveProxy (Caddy with naive plugin) + Hysteria2
- Storage: JSON files (default) or SQLite (optional)

**Purpose:** Simplify deployment and management of NaiveProxy (TCP/443, HTTPS disguise) and Hysteria2 (UDP/443, QUIC-based) proxy services.

---

## Service Names

### Systemd Units

| Service Name | Description | Binary/Config |
|--------------|-------------|---------------|
| `naive.service` | Caddy with NaiveProxy forward proxy plugin | `/usr/local/bin/caddy-naive` + `/etc/naive/Caddyfile` |
| `hysteria.service` | Hysteria2 proxy server | `/usr/local/bin/hysteria` + `/etc/hysteria/config.yaml` |
| `pm2-root.service` | PM2 process manager (runs panel backend) | PM2 managed |
| `caddy-cert-watcher.path` | Watches Caddy cert directory for changes | Conditional (shared cert mode) |
| `caddy-cert-watcher.service` | Restarts hysteria on cert change | oneshot, triggered by path unit |

> Note: `panel-naive-hy2.service` does not exist on the server (PM2 is used instead).
> `caddy-cert-watcher.*` units are only created when Hysteria2 shares Caddy's TLS certificate (see TLS modes below).

### PM2 Process

| PM2 App Name | Description | Start Command |
|--------------|-------------|---------------|
| `panel-naive-hy2` | Panel backend (primary) | `pm2 start server/index.js --name panel-naive-hy2` |

### Important Notes

- NaiveProxy is served by **Caddy** with the `forwardproxy` plugin (not a standalone binary)
- Hysteria2 has two TLS modes when installed alongside NaiveProxy with Let's Encrypt:
  - **Shared Caddy cert** (recommended): Hy2 reads Caddy's cert files directly; `caddy-cert-watcher` restarts Hy2 on renewal
  - **Own ACME**: Hy2 runs its own Let's Encrypt client independently
- For self-signed mode, both services use the same self-signed certificate
- The panel itself runs on port **3000**, bound to `127.0.0.1` (SSH-only access)

---

## Backend API Reference

All endpoints are prefixed with `/api`. Authentication is required for most endpoints (session-based via `rixxx_sid` cookie).

### Authentication Routes (`/api`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/login` | Login with username/password | No (rate-limited) |
| `POST` | `/api/logout` | Logout current session | No |
| `GET` | `/api/me` | Get current authenticated user | Yes |
| `POST` | `/api/config/change-password` | Change admin password | Yes |

### System Routes (`/api`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/config` | Get full panel configuration | Yes |
| `GET` | `/api/system/version` | Get panel version (from `/etc/rixxx-panel/version`) | Yes |
| `GET` | `/api/status` | Get service status (installed, active, user counts) | Yes |
| `GET` | `/api/traffic` | Get traffic statistics (daily, hourly, connections) | Yes |
| `POST` | `/api/service/:kind/:action` | Control services (start/stop/restart) | Yes |

**Service action parameters:**
- `kind`: `naive` (Caddy/NaiveProxy → `naive.service`) or `hy2` (Hysteria2 → `hysteria.service`)
- `action`: `start`, `stop`, or `restart`

### NaiveProxy User Routes (`/api`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/naive/users` | List all NaiveProxy users | Yes |
| `POST` | `/api/naive/users` | Create new NaiveProxy user | Yes |
| `DELETE` | `/api/naive/users/:username` | Delete NaiveProxy user | Yes |
| `PATCH` | `/api/naive/users/:username` | Update NaiveProxy user | Yes |

### Hysteria2 User Routes (`/api`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/hy2/users` | List all Hysteria2 users | Yes |
| `POST` | `/api/hy2/users` | Create new Hysteria2 user | Yes |
| `DELETE` | `/api/hy2/users/:username` | Delete Hysteria2 user | Yes |
| `PATCH` | `/api/hy2/users/:username` | Update Hysteria2 user | Yes |

### Diagnostics Routes (`/api`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/logs/:kind` | Get service logs (naive/hy2/panel) | Yes |
| `GET` | `/api/diag/ports` | Check port bindings (TCP/UDP) | Yes |
| `GET` | `/api/diag/hysteria-config` | Get Hysteria2 configuration | Yes |
| `POST` | `/api/diag/fix-hy2-tls` | Fix Hysteria2 TLS certificate paths | Yes |
| `GET` | `/api/tuning/status` | Get kernel tuning status (BBR, UDP buffers) | Yes |
| `POST` | `/api/tuning/apply` | Apply kernel tuning (sysctl) | Yes |

### ACL Routes (`/api`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/acl` | Get ACL (access control list) configuration | Yes |
| `PUT` | `/api/acl` | Update ACL configuration | Yes |
| `GET` | `/api/acl/geosite-list` | Get available geosite domains | Yes |
| `GET` | `/api/acl/geoip-list` | Get available geoip countries | Yes |
| `POST` | `/api/acl/geo-update` | Update geo databases (geosite/geoip) | Yes |

### WebSocket Endpoints

| Path | Description | Auth |
|------|-------------|------|
| `ws://host:port/` | Installation progress streaming | Yes (session) |

**WebSocket message types:**
- `install_naive` - Install NaiveProxy only
- `install_hy2` - Install Hysteria2 only
- `install_both` - Install both protocols
- `log` - Installation progress log
- `install_done` - Installation completed
- `install_error` - Installation failed

---

## Frontend Pages and Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | `LoginPage` | Authentication page |
| `/` | `DashboardPage` | Main dashboard (service status, quick actions) |
| `/install` | `InstallPage` | Installation wizard for proxy services |
| `/users` | `UsersPage` | Manage NaiveProxy and Hysteria2 users |
| `/acl` | `AclPage` | Access control list configuration |
| `/diagnostics` | `DiagnosticsPage` | Service logs, port checks, diagnostics |
| `/settings` | `SettingsPage` | Panel settings (password, etc.) |

**Navigation:** Sidebar with links to all pages. User info and logout button at bottom.

---

## File System Layout

### Panel Installation

```
/opt/panel-naive-hy2/              # Main project directory (git repo)
├── panel/                         # Panel application
│   ├── server/                    # Backend (Express.js)
│   │   ├── index.js               # Entry point
│   │   ├── routes/                # API route definitions
│   │   ├── controllers/           # Route handlers
│   │   ├── services/              # Business logic (storage, system adapter)
│   │   ├── middleware/             # Auth middleware
│   │   └── utils/                 # Validators, helpers
│   ├── src/                       # Frontend (React)
│   │   ├── App.tsx                # Router configuration
│   │   ├── pages/                 # Page components
│   │   ├── components/            # Reusable components
│   │   └── contexts/              # React contexts (Auth, Toast)
│   ├── data/                      # Runtime data
│   │   ├── config.json            # Panel configuration
│   │   ├── users.json             # Admin users (bcrypt hashed)
│   │   ├── acl.json               # ACL configuration
│   │   ├── panel.db               # SQLite database (if USE_SQLITE)
│   │   └── .session_secret        # Session encryption key
│   ├── scripts/                   # Installation scripts
│   │   ├── install_naiveproxy.sh  # NaiveProxy installer
│   │   └── install_hysteria.sh    # Hysteria2 installer
│   └── package.json               # Node.js dependencies
└── .git/                          # Git repository
```

### NaiveProxy (Caddy)

```
/usr/local/bin/caddy-naive                # Caddy binary (with naive plugin)
/etc/naive/Caddyfile                      # Caddy configuration
/etc/naive/Caddyfile.last                 # Previous config (backup)
/etc/naive/traffic.json                   # Traffic data
/var/lib/caddy/.local/share/caddy/certificates/  # TLS certificates (primary)
/root/.local/share/caddy/certificates/           # TLS certificates (fallback)
/var/www/html/index.html                  # Masquerade page (local mode)
/var/www/naive/index.html                 # Copy of masqerade page
```

### Hysteria2

```
/usr/local/bin/hysteria            # Hysteria2 binary
/etc/hysteria/config.yaml          # Hysteria2 configuration
```

### System Files

```
/etc/sysctl.d/99-vps-test-tune.conf              # Kernel tuning (BBR, UDP buffers)
/etc/systemd/system/naive.service                 # NaiveProxy (Caddy) systemd unit
/etc/systemd/system/hysteria.service              # Hysteria2 systemd unit
/etc/systemd/system/pm2-root.service              # PM2 process manager systemd unit
/etc/systemd/system/caddy-cert-watcher.path       # Watches Caddy cert dir (shared cert mode)
/etc/systemd/system/caddy-cert-watcher.service    # Restarts hysteria on cert change
```

---

## Data Flow

### Frontend → Backend Communication

1. **REST API:** Frontend makes HTTP requests to `/api/*` endpoints
2. **WebSocket:** Real-time installation progress via WebSocket connection
3. **Session:** Authentication via `rixxx_sid` cookie (express-session)

### Backend → System Service Management

```
Backend (Express)
  ↓
systemAdapter.js
  ↓
systemctl (start/stop/restart naive, hysteria)
  ↓
NaiveProxy (Caddy) ← /etc/naive/Caddyfile
Hysteria2 ← /etc/hysteria/config.yaml
```

### Configuration Update Flow

1. User modifies settings via frontend
2. Frontend sends API request to backend
3. Backend updates `config.json` (with backup)
4. Backend regenerates service config files (`/etc/naive/Caddyfile`, `/etc/hysteria/config.yaml`)
5. Backend reloads/restarts affected services

### User Management Flow

1. Admin creates/edits/deletes users via frontend
2. Backend updates `config.json` (naiveUsers/hy2Users arrays)
3. Backend regenerates service config files with new user credentials
4. Backend reloads services to apply changes

### Expire Checker

- Runs every 5 minutes in background
- Checks user expiration dates
- Filters expired users from config
- Reloads services if any users expired

---

## Configuration Files

### Panel Configuration (`/opt/panel-naive-hy2/panel/data/config.json`)

```json
{
  "installed": true,
  "stack": {
    "naive": true,
    "hy2": true
  },
  "domain": "vpn.example.com",
  "email": "admin@example.com",
  "tlsMode": "letsencrypt",
  "panelDomain": "",
  "panelEmail": "",
  "accessMode": "2",
  "sshOnly": 1,
  "listenHost": "127.0.0.1",
  "masqueradeMode": "local",
  "masqueradeUrl": "",
  "serverIp": "1.2.3.4",
  "arch": "x86_64",
  "port": 8443,
  "adminPassword": "",
  "naiveUsers": [
    {
      "username": "user1",
      "password": "pass123",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "hy2Users": [
    {
      "username": "default",
      "password": "pass456",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Admin Users (`/opt/panel-naive-hy2/panel/data/users.json`)

```json
{
  "admin": {
    "password": "$2a$10$...bcrypt_hash...",
    "role": "admin"
  }
}
```

### Caddy Configuration (`/etc/naive/Caddyfile`)

```
{
  order forward_proxy before file_server
  servers {
    protocols h1 h2
  }
}

:8443, vpn.example.com {
  tls admin@example.com

  forward_proxy {
    basic_auth user1 pass123
    hide_ip
    hide_via
    probe_resistance
    geoip_dat /etc/hysteria/geoip.dat
    geosite_dat /etc/hysteria/geosite.dat
    acl {
      geosite category-ads-all deny
      geosite category-ip-geo-detect deny
      geosite geolocation-cn deny
      geoip RU deny
      geoip CN deny
      geoip BY deny
      geoip IR deny
      allow all
    }
  }

  file_server {
    root /var/www/naive
  }
}
```

### Hysteria2 Configuration (`/etc/hysteria/config.yaml`)

TLS section varies by mode:

**Shared Caddy cert (Let's Encrypt):**
```yaml
tls:
  cert: /var/lib/caddy/.local/share/caddy/certificates/<ca>/<domain>.crt
  key: /var/lib/caddy/.local/share/caddy/certificates/<ca>/<domain>.key
```

**Own ACME (Let's Encrypt):**
```yaml
acme:
  domains:
    - vpn.example.com
  email: admin@example.com
  ca: letsencrypt
  listenHost: 0.0.0.0
```

**Self-signed:**
```yaml
tls:
  cert: /etc/ssl/selfsigned/server.crt
  key: /etc/ssl/selfsigned/server.key
```

Full config (shared cert mode):
```yaml
listen: ":8443"

tls:
  cert: /var/lib/caddy/.local/share/caddy/certificates/<ca>/<domain>.crt
  key: /var/lib/caddy/.local/share/caddy/certificates/<ca>/<domain>.key

auth:
  type: userpass
  userpass:
    default: "pass456"

masquerade:
  type: file
  file:
    dir: /var/www/naive

ignoreClientBandwidth: true

trafficStats:
  listen: ":9999"

quic:
  initStreamReceiveWindow: 8388608
  maxStreamReceiveWindow: 8388608
  initConnReceiveWindow: 20971520
  maxConnReceiveWindow: 20971520
  maxIdleTimeout: 30s
  keepAlivePeriod: 10s

acl:
  file: /etc/hysteria/acl.rules
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Backend listening port |
| `LISTEN_HOST` | `0.0.0.0` | Backend bind address (`127.0.0.1` for SSH-only) |
| `NODE_ENV` | - | Set to `production` in deployment |
| `USE_SQLITE` | `false` | Use SQLite instead of JSON files |
| `USE_NEW_FRONTEND` | `true` | Use React frontend (vs legacy) |
| `TEST_MODE` | `false` | Enable test mode (skips systemctl calls) |
| `TEST_CONFIG_DIR` | - | Override config directory for tests |

---

## Network Ports

| Port | Protocol | Service | Notes |
|------|----------|---------|-------|
| 22 | TCP | SSH | System access |
| 80 | TCP | HTTP | Let's Encrypt validation (NaiveProxy) |
| 443 | TCP/UDP | UFW allow | Open for proxy traffic |
| 8443 | TCP | NaiveProxy (Caddy) | HTTPS proxy |
| 8443 | UDP | Hysteria2 | QUIC proxy |
| 9999 | TCP | Hysteria2 stats | Traffic statistics server |
| 3000 | TCP | Panel backend | Internal only (127.0.0.1) |

---

## Security Considerations

1. **Session Security:** Persistent session secret (generated once, stored in `.session_secret`)
2. **Rate Limiting:** Login endpoint is rate-limited
3. **SSH-only Mode:** Panel binds to `127.0.0.1` only, accessible via SSH tunnel
4. **UFW Firewall:** Only ports 22, 80, 8443 (TCP+UDP), 443 are allowed; 8080 and 3000 are denied
5. **TLS Certificates:** NaiveProxy uses Caddy (Let's Encrypt auto-renewal). Hysteria2 either shares Caddy's cert (with `caddy-cert-watcher` for auto-renewal) or uses its own ACME client. Self-signed mode uses a shared self-signed cert.
6. **Password Hashing:** Admin passwords stored with bcrypt
7. **ACL Filtering:** Both NaiveProxy and Hysteria2 enforce ACL rules (geosite/geoip blocking)

---

## Development

### Commands

```bash
# Development
npm run dev          # Start Vite dev server

# Build
npm run build        # Build TypeScript + Vite

# Production
npm start            # Start backend server

# Testing
npm test             # Run Vitest tests
npm run test:watch   # Run tests in watch mode

# Linting
npm run lint         # ESLint
```

### Project Structure

```
panel/
├── server/           # Backend (CommonJS)
│   ├── index.js      # Express app + WebSocket server
│   ├── routes/       # API route definitions
│   ├── controllers/  # Request handlers
│   ├── services/     # Business logic
│   ├── middleware/    # Auth, rate limiting
│   └── utils/        # Validators, helpers
├── src/              # Frontend (ESM + TypeScript)
│   ├── App.tsx       # React Router setup
│   ├── pages/        # Page components
│   ├── components/   # Shared components
│   ├── contexts/     # React contexts
│   ├── hooks/        # Custom hooks
│   └── api/          # API client functions
├── scripts/          # Bash installation scripts
└── data/             # Runtime data (JSON/SQLite)
```

---

## Version Information

- **Panel Version:** Read from `/etc/rixxx-panel/version` (fallback: `1.0.0`) — file may not exist
- **Node.js:** Requires v18+
- **NaiveProxy:** Built with xcaddy (custom binary at `/usr/local/bin/caddy-naive`)
- **Hysteria2:** Latest from GitHub releases

---

*This document serves as the definitive technical reference for the RIXXX Panel codebase.*