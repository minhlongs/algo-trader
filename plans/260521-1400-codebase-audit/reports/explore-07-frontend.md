# Frontend Surface Audit — Vite Dashboard + Landing + UI Components

**Date:** 2026-05-21  
**Scope:** Root-level Vite app, src/* satellite codebases, CF Pages integration  
**Status:** Read-only exploratory audit

---

## 1. Dashboard (`/dashboard` — Vite SPA)

### Configuration & Deployment
| Item | Value |
|------|-------|
| **Build tool** | Vite 6.2.0 |
| **React version** | 19.0.0 |
| **Styling** | Tailwind CSS 3.4.17 |
| **Routing** | React Router 7.2.0 |
| **State mgmt** | Zustand 5.0.3 |
| **Auth** | Better Auth 1.6.3 |
| **Charts** | Recharts 3.8.0, Lightweight Charts 4.2.2 |
| **Dev server proxy** | `/api` → `localhost:3000`, `/ws` → `ws://localhost:3001` (TLS possible) |
| **Production deploy** | Cloudflare Pages (static dist + functions) |

### Source Structure
```
dashboard/src/
├── main.tsx                    # Entry: BrowserRouter + App
├── App.tsx                     # 25 routes (public + /app/* auth-guarded)
├── components/                 # 56 files (layout-shell, auth-guard, sidebars, etc.)
├── pages/                      # 37 pages (dashboard, backtests, marketplace, guide, auth, etc.)
├── hooks/                      # 17 custom hooks (use-licenses, use-api-client, etc.)
├── stores/                     # Zustand stores (auth-store, etc.)
├── lib/                        # api-client.ts, auth-client.ts, utils
├── types/                      # TypeScript definitions
├── locales/                    # i18n (i18next + react-i18next)
└── i18n/config.ts
```

### Routing (React Router v7)
- **Public:** `/`, `/login`, `/signup`, `/pricing`, `/docs`, `/manifesto`, `/methodology`, `/terms`, `/privacy`
- **Authenticated (`/app/*`):** dashboard, strategies, backtests, licenses, reporting, settings, guide, account, coupons, setup
- All `/app/*` wrapped in `<AuthGuard><LayoutShell>...</LayoutShell></AuthGuard>`

### Authentication Flow
- **Library:** Better Auth (client: `authClient` from `lib/auth-client.ts`)
- **Method:** Email/password via Better Auth client (`authClient.signIn.email`, `signUp.email`)
- **State:** Zustand `useAuthStore` (persisted to localStorage)
- **Session:** `authClient.getSession()` called on store init
- **Token:** JWT stored in auth-store, auto-attached to all `/api/*` requests
- **Login page:** `/login` redirects to `/app` on success

### API Integration
- **Base URL:** `VITE_API_URL` env var (default: `https://api.cashclaw.cc`)
- **Fetch:** `apiClient` with retry logic (2 retries, 10s timeout)
- **Auth header:** `Authorization: Bearer {token}` auto-injected from auth-store
- **Dev proxy:** Vite dev server proxies `/api` to localhost:3000 + `/ws` to ws://localhost:3001

### Cloudflare Pages Functions
| File | Purpose |
|------|---------|
| `functions/api/stats.ts` | GET `/api/stats` — returns paper trade aggregates from D1 database (cached 5min in KV) |

**D1 Bindings:**
- `STATS_DB` → `algo-trader-prod` (nightly mirror of `paper_trades_v3` M1 Max table)
- `CACHE` (KV) → Edge caching, 5min TTL

### Validation Report
- **Status:** PASS ✅ (2026-03-28)
- 9/9 guide page components validated, all imports resolvable, no dead code

---

## 2. `src/dashboard/` — Backend Dashboard Server Layer

### Surprise #1: Dual Architecture
`src/dashboard/` is **not** a React component library. It's a **Node.js HTTP server** that:
1. Serves static dashboard files
2. Implements dashboard-specific API routes
3. Orchestrates **real-time data** (AI signals, paper trading P&L, hedge portfolio scans)

### Files & Purpose
| File | Purpose |
|------|---------|
| `dashboard-server.ts` (80 loc) | createServer, CORS, route delegation |
| `dashboard-routes.ts` (60 loc) | Route dispatcher (auth, admin POST, admin GET, API GET) |
| `dashboard-admin-routes.ts` | Admin endpoints (coupon create, user admin, etc.) |
| `dashboard-api-get-routes.ts` | Public/subscriber APIs (paper trade history, equity curve, stats) |
| `dashboard-route-helpers.ts` | Query builders, aggregations, response formatters |
| `dashboard-middleware.ts` | CORS, error handling |
| `dashboard-demo-data.ts` | Mock data for dev |
| `paper-trading-pnl-tracker.ts` (140 loc) | PnL calculation, strategy attribution |
| `dashboard.html` (176 loc) | Server-rendered fallback (minimal) |

### Data Flow
```
Vite SPA (/api/*)
    ↓
Vite dev proxy (localhost:3000)
    ↓
dashboard-server.ts (route dispatcher)
    ↓
database (user trades, strategies, performance)
    ↓
JSON response + JWT validation
```

### Key Insight
- **NOT** a duplicate of `/dashboard` Vite app
- Provides **backend APIs** that the `/dashboard` SPA consumes
- Uses pure `node:http` + `node:fs` (no Express)
- Integrates with `UserStore`, `AdminAnalytics`, `AiSignalGenerator`, `TradeObserver`, `LeaderBoard`

---

## 3. `src/landing/` — Marketing Landing Page

### Files
| File | Purpose |
|------|---------|
| `landing-server.ts` (60 loc) | Node.js HTTP server for `/index.html` + static assets |
| `public/` | HTML, CSS, JS, images (12 subdirs, analytics, blog, status page) |

### Characteristics
- **Pure static file server** — no dynamic routes, no API endpoints
- Serves marketing content, blog, analytics tracking
- Git history shows blog updates, referral tracking, A16z autonomy layer

---

## 4. `src/ui/` — Shared UI Design System

### Structure
```
src/ui/
├── design-system/           # CSS tokens & components
│   ├── components.css       # Component library styles
│   └── tokens.css           # Design tokens (colors, spacing, typography)
└── shared/                  # Shared utilities
    ├── format.js            # Formatting helpers
    ├── states.js            # State management utilities
    └── ws-client.js         # WebSocket client
```

### Purpose
- **Not a React component library** — pure CSS + JS utilities
- Shared between Vite dashboard + landing + any other frontends
- Global design tokens (Tailwind variables via CSS)

### Observations
- Only **0 TypeScript files** in `src/ui/`
- Design system exists in `/dashboard/src/components/` instead (56 React components)
- **Duplication concern:** CSS tokens in `src/ui/` are likely superseded by Tailwind in dashboard

---

## 5. Tech Stack Confirmation

### Dependency Chain (dashboard/package.json)
```
React 19.0.0 (latest)
  ├── React Router DOM 7.2.0 (client-side routing)
  ├── React Markdown 9.0.1 (guide rendering)
  └── React i18next 16.5.8 (i18n)

Better Auth 1.6.3 (auth)
  ├── Email/password authentication
  └── Stores JWT in Zustand + localStorage

Zustand 5.0.3 (state)
  ├── useAuthStore (auth state)
  └── persist middleware (localStorage sync)

Hono 4.7.0 (HTTP framework—used in Pages Functions?)
  └── serverless routing

Tailwind CSS 3.4.17 (styling)
  └── Dark mode (dark: class)

Vite 6.2.0 (build)
  ├── CF Pages deploy plugin
  └── Dev proxy for /api + /ws

Recharts 3.8.0 + Lightweight Charts 4.2.2 (charting)
```

### Dev Stack
- TypeScript 5.9.3
- Vitest 4.1.4 (unit tests)
- @vitejs/plugin-react 4.4.1 (JSX transform)
- Tailwind + PostCSS (styling pipeline)

---

## 6. Frontend Topology (Deployment Model)

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                         │
│         React 19 (Router, Auth, UI Components)              │
│              dashboard/src/ (Vite 6.2.0)                    │
└──────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴──────────────────┐
                │                                │
         ┌──────▼──────────┐          ┌──────────▼──────────┐
         │   Dev Proxy     │          │  Production CF      │
         │ (localhost:3000)│          │   Pages              │
         └──────┬──────────┘          └──────────┬──────────┘
                │                                │
    ┌──────────┬┘                    ┌───────────┼───────────┐
    │                                │                       │
┌───▼────────────────┐      ┌────────▼────────┐   ┌─────────▼──────┐
│  /api/* Routes     │      │  /api/stats     │   │  Static dist/  │
│  (dashboard-server)│      │  (Pages Fn)     │   │  index.html    │
│  + Real DB         │      │  D1 database    │   │  (Vite build)  │
│  + Services        │      │  KV cache       │   │                │
└────────────────────┘      └─────────────────┘   └────────────────┘
         │                           │
    ┌────▼─────────┐           ┌─────▼────────┐
    │ PostgreSQL   │           │  Cloudflare  │
    │ (app DB)     │           │  D1 (stats)  │
    └──────────────┘           │  KV (cache)  │
                               └──────────────┘
```

### Deployment Targets
1. **Dev:** `npm run dev` → Vite + proxy to localhost:3000 (dashboard-server)
2. **Staging:** `wrangler pages deploy` → CF Pages (staging branch)
3. **Production:** `wrangler pages deploy` → CF Pages (main)

---

## 7. Duplication & Architectural Concerns

### Issue #1: `src/dashboard/` vs `/dashboard`
- **`/dashboard`** = Vite React SPA (frontend UI)
- **`src/dashboard/`** = Node.js backend (APIs + real-time data)
- **NOT a duplicate** — complementary layers
- Git history shows modularization (Sprint 62: split 295-line route file into 4 files under 200 lines each)
- **Last modified:** 2026-04-16 (recent, active codebase)

### Issue #2: `src/ui/` Underutilized
- CSS tokens in `src/ui/design-system/` exist
- Dashboard uses **Tailwind directly** (not importing from `src/ui/`)
- `src/ui/shared/` JavaScript utilities (ws-client, format, states) are **not referenced** in dashboard package.json
- **Concern:** Design system CSS is **not compiled into Vite build**
- **Recommendation:** Either integrate `src/ui/` into Vite build pipeline OR consolidate tokens into Tailwind config

### Issue #3: Config Duplication
- `tailwind.config.ts` exists at `/dashboard/tailwind.config.ts`
- Design tokens also at `src/ui/design-system/tokens.css`
- **Both define colors/spacing** — single source of truth needed

---

## 8. Auth & Security Observations

### Positive
- Better Auth library handles cryptographic signing (server-side)
- JWT auto-attached to API requests via auth-store
- AuthGuard component gates protected routes
- Error boundary catches React errors
- Login form validates email + password before submit

### Gaps Identified
1. **VITE_API_URL env var** — hardcoded to `https://api.cashclaw.cc` if not set
   - Dev env proxy works but prod fallback is hardcoded
2. **CORS on CF Pages Functions** — open (`access-control-allow-origin: '*'`)
   - `/api/stats` endpoint accessible from any domain
3. **No rate limiting** on SPA side (retry logic has no backoff)
4. **Session refresh** — unclear if token refresh is automatic or manual

---

## 9. Open Questions

1. **Where does Better Auth server code live?**
   - `/api/auth/*` endpoints must be defined somewhere (not in `/dashboard/functions/`)
   - Likely in main API server at `src/app.ts` or similar

2. **Why `/api/stats` on CF Pages vs main API server?**
   - Is this for edge caching (performance) or database separation?
   - What's the relationship between CF D1 and main PostgreSQL?

3. **Is `src/ui/` actively used?**
   - No TypeScript files, no React components
   - Dashboard imports from `/dashboard/src/components/` instead
   - Should this be archived or integrated?

4. **WebSocket support:**
   - Vite proxy to `ws://localhost:3001` configured
   - What service listens on port 3001? (Not in `src/` visible)

5. **i18n coverage:**
   - `i18next` configured but only `en.json` visible
   - Are there other locale files in `locales/`?

6. **Test coverage:**
   - `vitest` configured but test command rarely used
   - No visible test files in `/dashboard/src/`

---

## Summary

**Frontend is well-structured:**
- Vite SPA (React 19, Router, Zustand) in `/dashboard/`
- Backend APIs in `src/dashboard/` (Node.js HTTP server)
- Separate landing page (`src/landing/`) + underutilized design system (`src/ui/`)
- CF Pages + D1 for stats edge caching
- Better Auth for authentication
- Clear separation of concerns (UI, API, design tokens)

**Quick wins to clean up:**
1. Consolidate `src/ui/tokens.css` into `/dashboard/tailwind.config.ts`
2. Confirm whether `src/landing/` and `src/ui/` are still active or candidates for removal
3. Document Better Auth server-side endpoints location
4. Add rate limiting + token refresh strategy to auth-store

