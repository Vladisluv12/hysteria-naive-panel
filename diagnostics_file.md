Comprehensive Frontend Panel Report: Naive + Hysteria2 by RIXXX
1. Complete File Tree
panel/
├── index.html                          # Vite entry point (React SPA shell)
├── package.json                        # Project config
├── vite.config.ts                      # Vite config (proxies /api to localhost:3000)
├── tsconfig.json                       # TypeScript config (ES2020, React JSX)
├── vitest.config.js                    # Vitest config (jsdom environment)
│
├── src/                                # ===== REACT FRONTEND (new) =====
│   ├── main.tsx                        # React entry point (StrictMode + root render)
│   ├── App.tsx                         # Router, AuthGuard, route definitions
│   ├── vite-env.d.ts                   # Vite type reference
│   │
│   ├── types/
│   │   └── api.ts                      # TypeScript interfaces for all API data
│   │
│   ├── styles/
│   │   └── global.css                  # CSS variables (design tokens) + base reset
│   │
│   ├── api/                            # API client layer
│   │   ├── client.ts                   # Base HTTP client (fetch wrapper with credentials)
│   │   ├── auth.ts                     # /api/login, /api/logout, /api/me, /api/config/change-password
│   │   ├── naive.ts                    # /api/naive/users (CRUD)
│   │   ├── hysteria.ts                 # /api/hy2/users (CRUD)
│   │   ├── system.ts                   # /api/status, /api/config, /api/system/version, /api/traffic, /api/service/:kind/:action
│   │   ├── traffic.ts                  # /api/traffic (duplicate of system.getTraffic)
│   │   ├── bypass.ts                   # /api/bypass (GET, POST, DELETE)
│   │   ├── tuning.ts                   # /api/tuning/status, /api/tuning/apply
│   │   ├── acl.ts                      # /api/acl (GET, PUT), /api/acl/geo-update, /api/acl/geosite-list, /api/acl/geoip-list
│   │   └── diagnostics.ts              # /api/logs/:kind, /api/diag/ports, /api/diag/hysteria-config
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx              # Auth state (user, login, logout) via session cookies
│   │   └── ToastContext.tsx             # Toast notification state
│   │
│   ├── hooks/
│   │   └── useWebSocket.ts             # WebSocket hook for install progress
│   │
│   ├── components/
│   │   ├── Layout/                     # Sidebar + Outlet wrapper
│   │   │   ├── index.tsx
│   │   │   └── styles.module.css
│   │   ├── Modal/                      # Reusable modal dialog
│   │   │   ├── index.tsx
│   │   │   └── styles.module.css
│   │   ├── Toast/                      # Toast notification container
│   │   │   ├── index.tsx
│   │   │   └── styles.module.css
│   │   ├── Badge/                      # Expiry badge (inline styles)
│   │   │   └── index.tsx
│   │   └── CopyButton/                 # Clipboard copy button (inline styles)
│   │       └── index.tsx
│   │
│   └── pages/
│       ├── Login/                      # Login page
│       │   ├── index.tsx
│       │   ├── styles.module.css
│       │   └── index.test.tsx
│       ├── Dashboard/                  # Dashboard with service status + traffic
│       │   ├── index.tsx
│       │   ├── styles.module.css
│       │   └── index.test.tsx
│       ├── Install/                    # Proxy installation wizard (WebSocket)
│       │   ├── index.tsx
│       │   └── styles.module.css
│       ├── Users/                      # User management (Naive + Hysteria2 tabs)
│       │   ├── index.tsx
│       │   ├── styles.module.css
│       │   ├── index.test.tsx
│       │   └── components/
│       │       ├── UserTable.tsx        # User data table
│       │       ├── CreateUserModal.tsx   # Add user form
│       │       └── ExtendModal.tsx       # Extend user expiry
│       ├── Tuning/                     # Network tuning (BBR, UDP buffers)
│       │   ├── index.tsx
│       │   ├── styles.module.css
│       │   └── index.test.tsx
│       ├── Bypass/                     # Bypass/direct traffic for Hysteria2
│       │   ├── index.tsx
│       │   ├── styles.module.css
│       │   └── index.test.tsx
│       ├── ACL/                        # Access Control List management
│       │   ├── index.tsx
│       │   ├── styles.module.css
│       │   └── index.test.tsx
│       ├── Diagnostics/                # Logs, ports, Hysteria2 config viewer
│       │   ├── index.tsx
│       │   ├── styles.module.css
│       │   └── index.test.tsx
│       └── Settings/                   # Password change, panel info, client list
│           ├── index.tsx
│           ├── styles.module.css
│           └── index.test.tsx
│
├── public/                             # ===== LEGACY FRONTEND (vanilla JS) =====
│   ├── index.html                      # 1140-line monolithic HTML (all pages inline)
│   ├── css/
│   │   └── style.css                   # 1140-line global CSS
│   └── js/
│       └── app.js                      # 981-line vanilla JavaScript (all logic)
│
└── server/                             # ===== EXPRESS BACKEND =====
    ├── index.js                        # Express server + WebSocket install handler
    ├── traffic.js                      # Traffic monitoring (iptables)
    ├── trafficMonitor.js               # iptables rules management
    ├── caddyfile.js                    # Caddyfile parser/builder
    ├── middleware/
    │   └── auth.js                     # requireAuth (session check) + loginLimiter
    ├── controllers/
    │   ├── authController.js           # login, logout, me, changePassword
    │   ├── systemController.js         # getConfig, getStatus, getVersion, getTraffic, serviceAction
    │   ├── naiveController.js          # NaiveProxy user CRUD + writeCaddyfile
    │   ├── hysteriaController.js       # Hysteria2 user CRUD + writeHysteriaConfig + bypass ACL
    │   ├── aclController.js            # ACL config CRUD + geo dataset download
    │   └── diagController.js           # Logs, ports, hysteria config viewer, TLS fix, tuning
    ├── routes/
    │   ├── auth.js                     # POST /login, POST /logout, GET /me, POST /config/change-password
    │   ├── system.js                   # GET /config, /status, /traffic, /system/version, POST /service/:kind/:action
    │   ├── naive.js                    # GET/POST/DELETE/PATCH /naive/users
    │   ├── hysteria.js                 # GET/POST/DELETE/PATCH /hy2/users, GET/POST/DELETE /bypass
    │   ├── acl.js                      # GET/PUT /acl, GET /acl/geosite-list, /acl/geoip-list, POST /acl/geo-update
    │   └── diag.js                     # GET /logs/:kind, /diag/ports, /diag/hysteria-config, POST /diag/fix-hy2-tls, /tuning/status, /tuning/apply
    ├── services/
    │   ├── storageFactory.js           # Config/user persistence
    │   ├── atomicUpdate.js             # Atomic config updates
    │   ├── configBuilder.js            # Caddyfile + Hysteria config generation
    │   ├── aclBuilder.js               # ACL file generation + geo dataset download
    │   ├── caddyApi.js                 # Caddy API interaction
    │   ├── systemAdapter.js            # systemctl, journalctl, sysctl wrappers
    │   ├── sqliteStorage.js            # SQLite storage option
    │   ├── atomicConfig.js             # Atomic file writes with validation
    │   └── storage.js                  # File-based storage
    └── utils/
        └── validators.js               # Input validation (domain, email, username, password, expiry)
2. Complete Routing Structure
React Router (SPA):
Path	Component	Auth Required	Description
/login	LoginPage	No	Login form
/ (index)	DashboardPage	Yes	Service status + traffic overview
/install	InstallPage	Yes	Proxy installation wizard (WebSocket)
/users/*	UsersPage	Yes	User CRUD (subroutes: /users/naive, /users/hysteria)
/tuning	TuningPage	Yes	BBR + UDP buffer tuning
/bypass	BypassPage	Yes	Bypass/direct traffic ACL
/acl	AclPage	Yes	ACL: domain blocking, geosite, geoip
/diagnostics	DiagnosticsPage	Yes	Logs, ports, config viewer
/settings	SettingsPage	Yes	Password change, panel info, client apps list
Navigation sidebar items (in Layout/index.tsx):
Dashboard, Install, Users, Tuning, Bypass, Diagnostics, Settings -- note that ACL is not in the sidebar nav (accessible only via the /acl route but no sidebar link).
3. Complete List of API Calls the Frontend Makes
Authentication (src/api/auth.ts)
Method	Endpoint	Body
POST	/api/login	{username, password}
POST	/api/logout	none
GET	/api/me	none
POST	/api/config/change-password	{currentPassword, newPassword}
System (src/api/system.ts)
Method	Endpoint	Purpose
GET	/api/status	Full system status (services, domain, IP, user counts)
GET	/api/config	Raw config JSON
GET	/api/system/version	Panel version
GET	/api/traffic	Traffic data (duplicated in api/traffic.ts)
POST	/api/service/:kind/:action	Start/stop/restart caddy or hysteria-server
NaiveProxy Users (src/api/naive.ts)
Method	Endpoint	Purpose
GET	/api/naive/users	List users
POST	/api/naive/users	Create user
DELETE	/api/naive/users/:username	Delete user
PATCH	/api/naive/users/:username	Update user expiry
Hysteria2 Users (src/api/hysteria.ts)
Method	Endpoint	Purpose
GET	/api/hy2/users	List users
POST	/api/hy2/users	Create user
DELETE	/api/hy2/users/:username	Delete user
PATCH	/api/hy2/users/:username	Update user expiry
Bypass (src/api/bypass.ts)
Method	Endpoint	Purpose
GET	/api/bypass	Get bypass status + preview
POST	/api/bypass	Update/upload bypass list
DELETE	/api/bypass	Clear bypass list
Tuning (src/api/tuning.ts)
Method	Endpoint	Purpose
GET	/api/tuning/status	BBR + UDP buffer status
POST	/api/tuning/apply	Apply sysctl tuning
ACL (src/api/acl.ts)
Method	Endpoint	Purpose
GET	/api/acl	Get ACL config
PUT	/api/acl	Update ACL config
POST	/api/acl/geo-update	Download/update geoip/geosite datasets
GET	/api/acl/geosite-list	List available geosite categories
GET	/api/acl/geoip-list	List available geoip countries
Diagnostics (src/api/diagnostics.ts)
Method	Endpoint	Purpose
GET	/api/logs/:kind	Get service logs (caddy/hysteria)
GET	/api/diag/ports	Port/process info
GET	/api/diag/hysteria-config	Raw Hysteria2 config (passwords masked)
WebSocket (Install)
Protocol	Path	Messages
WS	ws(s)://host/	Client sends: install_naive, install_hy2, install_both. Server sends: log, install_done, install_error
4. Authentication / Authorization Logic
Frontend Auth (src/contexts/AuthContext.tsx)
- Mechanism: Cookie-based session (express-session with rixxx_sid cookie).
- Flow: On mount, AuthProvider calls GET /api/me. If the response is 401 Unauthorized, user is set to null.
- AuthGuard: Wraps all protected routes. If user is null and not loading, redirects to /login.
- Login: Calls POST /api/login -> on success, calls GET /api/me to get username/role -> stores in React context.
- Logout: Calls POST /api/logout -> sets user to null.
- No role-based ACL on the frontend: The User type has a role field, but no page checks it. All authenticated users see all pages. There is no admin/user distinction enforced in the UI.
Backend Auth (server/middleware/auth.js)
- requireAuth middleware checks req.session.authenticated.
- Login rate limiting: 5 attempts per 15 minutes per IP.
- Default credentials: admin / admin with a mustChangePassword flag returned by /api/me.
- Passwords hashed with bcryptjs.
- Session secret persisted to disk (data/.session_secret).
- WebSocket connections are minimally protected by checking for rixxx_sid cookie presence (not a full session validation).
Security Notes
- The me() endpoint returns mustChangePassword flag when logged in as admin with default password.
- The frontend currently does NOT display or handle the mustChangePassword flag -- it is returned but not used in AuthContext or LoginPage.
- No CSRF protection beyond sameSite: lax on the session cookie.
5. ACL (Access Control) Logic
Frontend ACL Page (src/pages/ACL/index.tsx)
The ACL page provides full UI for Hysteria2 access control:
- Enable/disable toggle for the ACL system.
- Domain blocking: textarea input for domains (one per line).
- Geosite category blocking: checkbox grid loaded from /api/acl/geosite-list. Categories include: category-ru, category-gov, category-bank, google, microsoft, geositesgoogle, etc.
- Geoip country blocking: checkbox grid loaded from /api/acl/geoip-list. Countries include cn, ir, ru, etc.
- direct(all) toggle: whether to route unblocked traffic directly.
- Bypass CIDR read-only display: shows CIDRs from the Bypass page, with a link to edit on /bypass.
- Save: calls PUT /api/acl with all settings.
- Geo update: calls POST /api/acl/geo-update to download fresh geoip/geosite datasets.
Bypass Logic (src/pages/Bypass/index.tsx + server/controllers/hysteriaController.js)
- Manages direct (bypass) traffic for Russian IP ranges.
- Accepts JSON or plain CIDR lists.
- Saved to data/bypass.json and written to /etc/hysteria/bypass-ru.acl.
- When bypass is active, it is merged into the Hysteria2 config as an acl.file directive.
- The bypass ACL generates lines like direct(5.101.37.0/24) which Hysteria2 interprets to route those CIDRs directly (not through the proxy).
What the frontend controls regarding ACL:
1. Domain blocklist -> written to /etc/hysteria/acl.rules
2. Geosite category blocklist -> resolved against downloaded geosite.dat
3. Geoip country blocklist -> resolved against downloaded geoip.dat
4. Bypass CIDRs -> written to /etc/hysteria/bypass-ru.acl (separate from main ACL)
5. direct(all) -> whether unblocked traffic goes direct
6. Hysteria2 Config Push Functionality
How Hysteria2 config is managed:
The frontend does NOT directly push config files to Hysteria2. Instead:
1. User CRUD operations (hysteriaController.js): When a user is created/deleted/updated via the API, the controller:
- Updates the internal config (data/config.json)
- Calls writeHysteriaConfig(cfg) which generates /etc/hysteria/config.yaml
- Restarts hysteria-server via systemctl
2. Bypass operations (hysteriaController.js): When bypass is updated:
- The bypass CIDRs are written to /etc/hysteria/bypass-ru.acl
- writeHysteriaConfig() is called to regenerate the config with the ACL reference
- Hysteria2 is restarted
3. ACL operations (aclController.js): When ACL settings are saved:
- The ACL rules are generated via aclBuilder.js and written to /etc/hysteria/acl.rules
- writeHysteriaConfig() is called to regenerate the config
- Hysteria2 is restarted
4. Config generation (services/configBuilder.js): Builds the full Hysteria2 YAML config object including:
- TLS certificate paths (from Caddy)
- User auth entries (username:password)
- Masquerade settings
- ACL file references
- Bandwidth settings
- QUIC parameters
5. Install via WebSocket (server/index.js): The install page uses WebSocket to stream shell script output:
- install_naiveproxy.sh - installs Caddy + NaiveProxy
- install_hysteria.sh - installs Hysteria2
- Both scripts handle binary download, config generation, systemd service setup
7. CSS/Styling Approach
New React Frontend (panel/src/)
- CSS Modules for all components and pages (e.g., styles.module.css)
- CSS Variables (design tokens) defined in src/styles/global.css (shared with legacy)
- Global CSS: only the base reset, custom properties, and scrollbar styles
- Inline styles: used sparingly in Badge/index.tsx and CopyButton/index.tsx (small utility components)
- Dark theme: deep dark purple/blue palette with accent colors (purple #6d28d9, blue #2563eb)
- No CSS framework (no Tailwind, no Bootstrap)
- Custom "shiny button" design with gradient backgrounds and box shadows
- Fonts: Inter (main), JetBrains Mono (monospace) -- loaded via Google Fonts in legacy HTML
Legacy Frontend (panel/public/)
- Single global CSS file (style.css, 1140 lines)
- Same design tokens as the React version (shared :root variables)
- Same dark theme and component patterns
8. Issues and Contradictions Found
8.1. Dual Frontend (Legacy + React) -- Major Architectural Concern
The server (server/index.js, lines 92-96) chooses between dist/ (React build) and public/ (legacy) based on USE_NEW_FRONTEND env var:
const frontendDir = process.env.USE_NEW_FRONTEND === 'true'
  ? path.join(__dirname, '..', 'dist')
  : path.join(__dirname, '..', 'public');
Both frontends are maintained simultaneously. The legacy public/ frontend has significantly MORE features than the React one:
- Legacy has: progress bar with step-by-step visualization during install, TLS fix button, quick links on dashboard, password generator for install, detailed tuning explanation, modal confirmations for delete, traffic monitoring on dashboard
- React has: cleaner code, TypeScript, CSS modules, but is missing: TLS fix, quick links, password generator, detailed install progress visualization, the ACL page uses a mix of CSS module classes AND legacy global classes (e.g., className="card", className="form-group", className="btn btn-shiny")
8.2. ACL Page Inconsistent Styling (src/pages/ACL/index.tsx)
The ACL page uses a mix of CSS module classes and global CSS classes:
- Module classes: styles.loading, styles.toggleRow, styles.toggleLabel, styles.checkGrid, styles.checkItem, styles.bypassPreview, styles.bypassLink, styles.geoInfo
- Global classes (without styles. prefix): "page-header", "page-title", "btn btn-outline btn-sm", "card", "card-body", "card-header", "card-title", "form-group", "form-input", "form-actions", "btn btn-shiny", "info-row", "info-key", "info-val", "dot dot-green", "dot dot-gray", "tuning-desc"
These global classes are only defined in public/css/style.css (the legacy CSS). When using the React build, they would be undefined unless the global CSS is also loaded. This is a bug -- the ACL page would render without proper styling in the React build.
8.3. Navigation: ACL Page Missing from Sidebar
The sidebar navigation in Layout/index.tsx does NOT include a link to the ACL page:
const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/install', label: 'Install' },
  { to: '/users', label: 'Users' },
  { to: '/tuning', label: 'Tuning' },
  { to: '/bypass', label: 'Bypass' },
  { to: '/diagnostics', label: 'Diagnostics' },
  { to: '/settings', label: 'Settings' },
];
ACL is defined as a route in App.tsx (/acl) but has no sidebar entry. Users can only reach it by manually typing the URL. The legacy frontend DOES include ACL in its navigation.
8.4. Missing ACL Route in Sidebar (Legacy vs React)
The legacy public/index.html does NOT have an ACL page at all in its navigation. The ACL page is React-only. However, it is unreachable from the sidebar.
8.5. Duplicate Traffic API
src/api/traffic.ts and src/api/system.ts both export a getTraffic() function calling GET /api/traffic. The Users page uses traffic.ts, while the Dashboard uses system.ts.
8.6. mustChangePassword Flag Not Used in Frontend
The backend returns mustChangePassword: true when logged in with default admin/admin credentials. The AuthContext does not expose this flag, and the LoginPage does not handle it. Users are not prompted to change their default password in the React frontend.
8.7. Install Page WebSocket Connection
The useWebSocket hook connects to ws(s)://host/ (root path), which is the same WebSocket server that handles install commands. The hook does not send any authentication beyond relying on the browser's cookie being attached to the WebSocket upgrade request. The backend only checks for the presence of rixxx_sid in the cookie string (line 126 of server/index.js), not the actual session validity.
8.8. Hysteria2 User Endpoint Mismatch
- Frontend api/hysteria.ts calls GET /api/hy2/users
- Backend routes/hysteria.js defines router.get('/hy2/users', ...)
- But the backend listUsers() returns { users: [...] } (an object with a users property)
- The frontend api/hysteria.ts types the return as Promise<HysteriaUser[]> (an array)
- Same issue for api/naive.ts which types the return as Promise<NaiveUser[]>
- The UsersPage accesses the result directly as an array: setUsers(u) where u is the API response
- This would cause the table to display [object Object] because the actual response is { users: [...] }
This is a type mismatch bug: the frontend types expect an array but the server returns { users: [...] }.
8.9. Bypass Page Frontend-Backend Contract Mismatch
- Frontend api/bypass.ts types: BypassStatus with { enabled, entries, file } but the actual backend response is { enabled, count, source, updatedAt, preview }
- The BypassPage uses status?.entries and status?.file which do not exist in the backend response. It should use status?.count and would need a different field for the file path.
- The updateBypass frontend sends { content: string } but the backend expects { cidrs, json, enabled, source }.
8.10. Diagnostics Page Backend Mismatch
The diagController.getLogs() returns { unit, output } (a string), but the frontend types LogEntry[] (an array of { timestamp, line }). The frontend tries to iterate over logs with .map(), which would fail on a string.
Similarly, getPorts() returns { output: string } but the frontend types PortInfo[].
8.11. Dashboard Status Object Mismatch
- Frontend SystemStatus type: { caddy, hysteria, panelUptime, serverIp, domain }
- Backend getStatus() response: { installed, stack, domain, email, serverIp, arch, naive: {active, usersCount}, hy2: {active, usersCount} }
- The Dashboard page checks status?.caddy and status?.hysteria as strings ('active' | 'inactive'), but the backend returns status.naive.active and status.hy2.active as booleans.
This is a major data shape mismatch -- the Dashboard would not display service status correctly with the React frontend.

