# Frontend Migration: Vanilla JS → React + TypeScript

## Goal

Rewrite panel frontend from monolithic vanilla JS (`public/index.html` + `public/js/app.js` + `public/css/style.css`) to **React 19 + Vite 6 + TypeScript 5** via incremental migration — old and new frontends coexist until full parity.

## Constraints

- Panel must remain functional at every step (no "big bang")
- Express backend stays untouched
- Old `public/` lives until manual verification confirms visual parity
- No external state management libraries — React Context + local state is sufficient

## Architecture

```
panel/
├── public/              ← old frontend (served in prod by default)
├── src/                 ← new React + TypeScript
│   ├── main.tsx         ← entry point
│   ├── App.tsx          ← root component, Router, AuthGuard, Layout
│   ├── api/             ← typed fetch clients per domain
│   │   ├── client.ts        ← base fetch (cookies, error handling)
│   │   ├── auth.ts
│   │   ├── system.ts
│   │   ├── naive.ts
│   │   ├── hysteria.ts
│   │   ├── bypass.ts
│   │   ├── diagnostics.ts
│   │   └── tuning.ts
│   ├── components/      ← shared UI: Layout, Modal, Toast, Badge, CopyButton
│   ├── contexts/        ← AuthContext, ToastContext
│   ├── hooks/           ← useApi, useAuth, useWebSocket
│   ├── pages/           ← one folder per page with index.tsx + styles.module.css
│   │   ├── login/
│   │   ├── settings/
│   │   ├── dashboard/
│   │   ├── diagnostics/
│   │   ├── tuning/
│   │   ├── bypass/
│   │   ├── users/
│   │   └── install/
│   └── types/           ← DTO interfaces for all API responses
├── server/              ← Express (untouched)
├── index.html           ← Vite entry point
├── vite.config.ts
└── tsconfig.json
```

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Bundler | Vite 6 |
| Language | TypeScript 5 (strict) |
| Routing | React Router 7 |
| Styling | CSS Modules |
| Linting | ESLint |
| Testing | Vitest + React Testing Library |
| Dev server | Vite dev with proxy `/api` → `localhost:3000` |

## Routing

| Path | Page | Lazy |
|---|---|---|
| `/login` | Login | yes |
| `/` | Dashboard (status, traffic, quick actions) | yes |
| `/install` | Install wizard (WebSocket progress) | yes |
| `/users` | Users (redirects to /users/naive) | — |
| `/users/naive` | NaiveProxy users table + CRUD modals | yes |
| `/users/hysteria` | Hysteria2 users table + CRUD modals | yes |
| `/tuning` | Network tuning (BBR, UDP buffers) | yes |
| `/bypass` | Bypass ACL management | yes |
| `/diagnostics` | Logs, ports, configs | yes |
| `/settings` | Password change, panel info | yes |

AuthGuard wraps all routes except `/login` — redirects to `/login` if no session.

## Frontend Switching

In production, Express decides which frontend to serve via env variable:

```
USE_NEW_FRONTEND=false   → public/   (old, default)
USE_NEW_FRONTEND=true    → dist/     (new React)
```

Switch is instant (PM2 restart). Old `public/` is removed manually after visual verification.

## State Management

- AuthContext — user session, login/logout
- ToastContext — notification queue
- All other state — local `useState`/`useEffect` in page components (pull-based: fetch on mount)

## API Layer

Single `client.ts` wraps `fetch()` with:
- Cookie-based auth (no manual token handling)
- Unified error response parsing
- Typed return values

Each domain gets its own file exporting typed functions (e.g. `listUsers(): Promise<NaiveUser[]>`).

## Migration Phases

### Phase 0 — Infrastructure
Vite, React, TypeScript, Router, AuthGuard, Layout (sidebar + header), Toast, API client. No pages yet.

### Phase 1 — Login
Low complexity (~50 lines in old code). Good warm-up.

### Phase 2 — Settings
Low complexity (~80 lines). Password change form, panel info.

### Phase 3 — Dashboard
Medium complexity (~120 lines). Service status cards, traffic display, quick actions.

### Phase 4 — Diagnostics
Medium complexity (~150 lines). Log viewer (lines + auto-scroll), port checker, config display.

### Phase 5 — Tuning
Low complexity (~60 lines). Status display, apply button.

### Phase 6 — Bypass
Medium complexity (~100 lines). File upload, text input, ACL management.

### Phase 7 — Users
High complexity (~300 lines). Two tables (Naive + Hy2), CRUD modals with forms, expiry management, link copy.

### Phase 8 — Install Wizard
High complexity. WebSocket progress streaming, interactive multi-step wizard. Done last — all shared components (Modal, Toast, etc.) already exist.

### Phase 9 — Cleanup (manual, not automated)
After manual visual verification of all pages, remove `public/` and set `USE_NEW_FRONTEND=true` as default.

## Non-Goals

- Backend TypeScript migration (out of scope)
- SSR / Next.js (overkill for admin panel)
- Responsive/mobile redesign (keep same layout)
- Design changes (visual parity with old version)

## Self-Review

- No TBD/TODO placeholders
- No contradictions between sections
- Single coherent scope: frontend rewrite only
- Phase order: low-risk pages first, complex ones last
- Clean rollback: `USE_NEW_FRONTEND=false`
