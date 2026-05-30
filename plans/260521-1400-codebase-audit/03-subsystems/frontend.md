# Subsystem — Frontend (Dashboard + Landing + UI)

**Overview.** Three frontend surfaces share one repo:
1. **`/dashboard`** — Vite 6.2 + React 19 SPA, deployed to CF Pages
2. **`src/dashboard/`** — Node http backend that serves dashboard-specific APIs (not a duplicate)
3. **`src/landing/`** — pure static marketing site server
4. **`src/ui/`** — CSS design tokens + JS utils (orphaned)

**Entry points.**
- `dashboard/src/main.tsx` — BrowserRouter + App mount
- `dashboard/src/App.tsx` — 25 routes (9 public + 16 under `/app/*` AuthGuard)
- `dashboard/functions/api/stats.ts` — CF Pages Function reading D1 (5min KV cache)
- `src/dashboard/dashboard-server.ts` (80 LOC) — Node http server, route dispatcher
- `src/landing/landing-server.ts` (60 LOC) — pure static file server

**Tech stack** (`dashboard/package.json`).
| Layer | Lib + Version |
|-------|---------------|
| Framework | React 19.0.0 |
| Router | React Router DOM 7.2.0 |
| State | Zustand 5.0.3 (persisted to localStorage) |
| Auth | Better Auth 1.6.3 (client) |
| Styling | Tailwind CSS 3.4.17 |
| Charts | Recharts 3.8.0 + Lightweight Charts 4.2.2 |
| HTTP | Hono 4.7.0 (in Pages Functions) |
| i18n | i18next + react-i18next 16.5.8 |
| Build | Vite 6.2.0 |
| Test | Vitest 4.1.4 |
| TS | TypeScript 5.9.3 |

**Routing.**
- **Public:** `/`, `/login`, `/signup`, `/pricing`, `/docs`, `/manifesto`, `/methodology`, `/terms`, `/privacy`
- **`/app/*` (AuthGuarded):** dashboard, strategies, backtests, licenses, reporting, settings, guide, account, coupons, setup

**Auth flow.**
1. Better-Auth client `authClient.signIn.email` / `signUp.email`
2. JWT stored in Zustand `useAuthStore` (persisted to localStorage)
3. `authClient.getSession()` on store init
4. `Authorization: Bearer {token}` auto-injected by `apiClient`
5. `<AuthGuard>` gates `/app/*` routes

**Dev proxy.**
- `/api` → `localhost:3000` (dashboard-server)
- `/ws` → `ws://localhost:3001` (WebSocket — service not visible in `src/`)

**Prod API base.** `VITE_API_URL` (default fallback: `https://api.cashclaw.cc`).

**CF Pages Functions.**
- `functions/api/stats.ts` — GET `/api/stats` → D1 `STATS_DB` reads → 5min KV cache
- D1 mirror of M1 Max `paper_trades_v3` (nightly sync via launchd)

**`src/dashboard/` layered files (not duplicates).**
| File | Purpose |
|------|---------|
| `dashboard-server.ts` | Node http createServer + CORS |
| `dashboard-routes.ts` | Route dispatcher (auth, admin POST, admin GET, API GET) |
| `dashboard-admin-routes.ts` | Admin endpoints (coupon create, user admin) |
| `dashboard-api-get-routes.ts` | Public/subscriber APIs (paper trade history, equity, stats) |
| `dashboard-route-helpers.ts` | Query builders, aggregations |
| `dashboard-middleware.ts` | CORS + error handling |
| `dashboard-demo-data.ts` | Mock data for dev |
| `paper-trading-pnl-tracker.ts` | PnL calc, strategy attribution |
| `dashboard.html` | Minimal server-rendered fallback |

Last modified 2026-04-16 — active. Sprint 62 modularized a 295-line route file into 4 sub-200-line files.

**`src/ui/` orphan status.**
- Pure CSS tokens + vanilla JS (no React, no TS files)
- Dashboard uses Tailwind directly — does NOT import `src/ui/`
- `src/ui/shared/{format,states,ws-client}.js` not in `dashboard/package.json` deps
- Tokens duplicated in `dashboard/tailwind.config.ts`

**Risks.**
1. **`VITE_API_URL` hardcoded fallback** `https://api.cashclaw.cc` if env missed in build. LOW.
2. **CF Pages Function CORS open** (`*`) on `/api/stats`. LOW (public stats only).
3. **No SPA-side rate limiting** in retry logic. LOW.
4. **Session refresh strategy undocumented** — unclear if auto or manual. MEDIUM.
5. **`src/ui/` is dead weight** — confuses readers, never imported. LOW.
6. **WebSocket service on :3001 not located** in src/ (unclear what listens). MEDIUM.

**Missing docs.**
- Location of Better-Auth `/api/auth/*` server-side endpoints (likely `src/app.ts`)
- Why `/api/stats` lives on CF Pages vs main backend (edge cache rationale)
- Whether `src/ui/` should be archived or integrated into Vite build

**Confidence: HIGH.**
