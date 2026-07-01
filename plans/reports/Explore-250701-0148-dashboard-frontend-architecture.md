# Dashboard Frontend Architecture Report

**Date:** 2026-07-01
**Context:** `/Users/macbook/algo-trader/dashboard`
**Task:** Analyze existing dashboard frontend to inform marketplace frontend build.

---

## 1. Framework & Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Language | TypeScript 5.9 |
| Build tool | Vite 6 |
| CSS | TailwindCSS 3 with custom dark theme tokens |
| Charts | `lightweight-charts` (candlestick), `recharts` (area/bar) |
| Routing | `react-router-dom` v7 (BrowserRouter) |
| State management | Zustand v5 with `persist` middleware |
| Auth | `better-auth` v1.6 React client |
| i18n | i18next + react-i18next (en + vi locales) |
| Testing | Vitest + @testing-library/react |
| Package manager | pnpm |

### Vite Config (`/Users/macbook/algo-trader/dashboard/vite.config.ts`)
- Plugin: `@vitejs/plugin-react`
- Dev proxy: `/api` -> `http://localhost:3000`, `/ws` -> `ws://localhost:3001`
- Build output: `../dist/dashboard/` (local) or `dist/` (Cloudflare)

### Tailwind Config (`/Users/macbook/algo-trader/dashboard/tailwind.config.ts`)
Custom color palette:
- `bg` (#0F0F1A), `bg-card` (#1A1A2E), `bg-border` (#2D3142)
- `accent` (#00D9FF), `profit` (#00FF41), `loss` (#FF3366), `muted` (#8892B0)
- Monospace font family (Menlo/Monaco/Courier)
- Touch-friendly sizing (`min-h-touch: 44px`, `min-w-touch: 44px`)

---

## 2. Routing Pattern

**Entry:** `/Users/macbook/algo-trader/dashboard/src/main.tsx`
- Wraps `<App />` in `<BrowserRouter basename={import.meta.env.BASE_URL}>`

**Routes** (in `/Users/macbook/algo-trader/dashboard/src/App.tsx`):

| Path | Component | Layout | Auth |
|---|---|---|---|
| `/` | LandingSoloQuant | None | Public |
| `/manifesto`, `/methodology`, `/pricing` | ManifestoPage, etc. | None | Public |
| `/login`, `/signup` | LoginPage, SignupPage | None | Public |
| `/docs`, `/terms`, `/privacy` | DocsPage, etc. | None | Public |
| `/app` | DashboardPage | LayoutShell | AuthGuard |
| `/app/strategies` | MarketplacePage | LayoutShell | AuthGuard |
| `/app/backtests` | BacktestsPage | LayoutShell | AuthGuard |
| `/app/licenses` | LicensePage | LayoutShell | AuthGuard |
| `/app/reporting` | ReportingPage | LayoutShell | AuthGuard |
| `/app/settings` | SettingsPage | LayoutShell | AuthGuard |
| `/app/guide` | GuidePage | LayoutShell | AuthGuard |
| `/app/account` | AccountPage | LayoutShell | AuthGuard |
| `/app/coupons` | CouponAdminPage | LayoutShell | AuthGuard |
| `/app/setup` | SetupGuidePage | LayoutShell | AuthGuard |

**Key pattern:** Public routes are full-page (no sidebar). App routes nest inside `<AuthGuard><LayoutShell><Page /></LayoutShell></AuthGuard>`.

---

## 3. Layout & Sidebar

**Layout shell** (`/Users/macbook/algo-trader/dashboard/src/components/layout-shell.tsx`):
- Flex layout: sidebar (fixed on mobile, static on desktop) + main content area
- Mobile: slide-in sidebar with backdrop overlay, drag overlay to close
- Desktop: always-visible 256px sidebar
- Sticky mobile header with hamburger menu
- Scrollable content area with responsive padding

**Sidebar navigation** (`/Users/macbook/algo-trader/dashboard/src/components/sidebar-navigation.tsx`):
- Hardcoded `NAV_ITEMS` array with label, path, inline SVG icons
- Active state via `useLocation()` pathname matching
- Tier badge display + sign-out button
- Connection status indicator from `trading-store`
- `adminOnly` flag for Coupons page visibility

---

## 4. API Client Pattern

**Two versions exist** (likely need consolidation):

### Lightweight hook (`/Users/macbook/algo-trader/dashboard/src/hooks/use-api-client.ts`)
- `useApiClient()` returns `{ fetchApi, loading }`
- `fetchApi<T>(path, options?)` - fetch with JWT auto-attach, returns `T | null`
- Used by most page hooks (licenses, admin, etc.)
- No retry, no timeout

### Full client (`/Users/macbook/algo-trader/dashboard/src/lib/api-client.ts`)
- `apiClient.get<T>(endpoint)` and `apiClient.post<T>(endpoint, body?)` - standalone (non-hook)
- `useApiClient()` - hook version returning `{ fetchApi }` with catch+log
- Both auto-attach `Bearer {token}` from `useAuthStore.getState().token`
- Retry (2 attempts), timeout (10s), 4xx skip retry
- Base URL from `VITE_API_URL` env var, path prefix `/api`

**Auth client** (`/Users/macbook/algo-trader/dashboard/src/lib/auth-client.ts`):
- `better-auth/react` client configured with `baseURL` from env, `basePath: '/api/auth'`

---

## 5. State Management (Zustand)

6 stores in `/Users/macbook/algo-trader/dashboard/src/stores/`:

| Store | Purpose |
|---|---|
| `auth-store.ts` | Auth state (loggedIn, email, tier, role, token, tenantId) + login/signup/logout/fetchMe actions. Uses `persist` middleware (excludes token from localStorage). |
| `dashboard-store.ts` | Dashboard UI state (signals, metrics, adminStatus, health, refresh interval). Simple setters. |
| `trading-store.ts` | Real-time trading data (prices, positions, spreads, strategies, trades, botStatus, connection state). WebSocket buffer. |
| `ab-test-store.ts` | A/B test state. |
| `referral-store.ts` | Referral program state. |
| `xai-store.ts` | AI/analytics state. |

**Pattern:** Each store is a single `create<State>()(...)` call. No slices. Auth uses `persist` middleware. Everything else is ephemeral.

---

## 6. Component Patterns

### Page Pattern
- Each page in `/Users/macbook/algo-trader/dashboard/src/pages/` is a named export function component + `export default PageName`
- Pages use hooks for data loading, useState for local UI state
- Named export is used in routing; default export exists but unused

### Data Fetching Hook Pattern
Example: `/Users/macbook/algo-trader/dashboard/src/hooks/use-licenses.ts`
- `useLicenses()` returns `{ licenses, loading, error, reload, revokeLicense, deleteLicense, activateLicense }`
- Uses `fetchApi` from `useApiClient()`
- Uses `useState` for `licenses[]`, `loading`, `error`
- `useCallback` for safe memoized actions
- `useEffect` for initial load
- Optimistic local updates on mutate (e.g., filter/update license list)

### Card/UI Component Pattern
- Custom `Card` (`/Users/macbook/algo-trader/dashboard/src/components/ui/card.tsx`) - glass effect, rounded, padded
- Custom `Button` (`/Users/macbook/algo-trader/dashboard/src/components/ui/button.tsx`) - 4 variants (primary/secondary/danger/ghost), 3 sizes
- Both use `React.forwardRef`
- Inline SVG icons (no icon library)

### Standard Page Template
- Page wrapper: `<div className="space-y-6 font-mono">`
- Header: `<h1 className="text-white text-2xl font-bold tracking-tight">` + `<p className="text-muted text-xs mt-1">`
- Cards: `bg-bg-card border border-bg-border rounded-lg p-6`
- Buttons: `px-4 py-2 bg-accent text-bg text-sm font-semibold rounded hover:bg-accent/80`
- Tabs: license-page pattern with `border-b-2` active indicator
- Error toast: `bg-loss/10 border border-loss/40 rounded text-loss`
- Success toast: `bg-profit/10 border border-profit/40 rounded text-profit`

---

## 7. Existing Marketplace Page

**File:** `/Users/macbook/algo-trader/dashboard/src/pages/marketplace-page.tsx`

**Current state:** STATIC placeholder page. Components:
- Title "Strategies" with subtitle about PM strategies
- Card grid (1/2/3 columns responsive) with 3 hardcoded strategies:
  1. **Market Making** (status: `active`) - shows stats, links to `/app/settings`
  2. **Listing Arbitrage** (status: `coming-soon`) - disabled button
  3. **Cross-Platform Arbitrage** (status: `coming-soon`) - disabled button
- `StatusBadge` component: green pulse dot for active, grey "Coming Soon" for inactive
- No API calls, no filters, no search, no subscription, no pagination
- "Configure" button links to Settings page (no actual strategy configuration)

---

## 8. Backend Marketplace API Contract

The Express backend at `/Users/macbook/algo-trader/src/platform/api/routes/` exposes:

| Method | Route | Purpose | Tier Gate |
|---|---|---|---|
| GET | `/api/marketplace/listings` | List strategies (filtered, paginated, sorted) | FREE |
| GET | `/api/marketplace/listings/:id` | Get strategy detail | FREE |
| POST | `/api/marketplace/listings` | Publish new strategy | FREE |
| PATCH | `/api/marketplace/listings/:id` | Update own strategy (draft only) | FREE |
| POST | `/api/marketplace/listings/:id/request-vetting` | Submit for review | FREE |
| GET | `/api/marketplace/subscriptions` | List my subscriptions | ? |
| POST | `/api/marketplace/subscriptions` | Subscribe to strategy | ? |
| PATCH | `/api/marketplace/subscriptions/:id` | Update/cancel subscription | ? |
| POST | `/api/marketplace/reviews` | Submit review | ? |
| GET | `/api/marketplace/insights/:id` | Strategy performance insights | ? |
| Admin routes | `/api/admin/marketplace/...` | Vetting, revenue, manage | admin |

Filters supported: category, riskLevel, minSharpe, maxDrawdown, status, sortBy (sharpe/max_drawdown/win_rate/total_pnl/subscriber_count/created_at), search (full-text), page, limit.

---

## 9. What Needs to Be Built

Given the existing patterns and the backend API, the marketplace frontend needs:

### Page Structure (new files under `/Users/macbook/algo-trader/dashboard/src/pages/`)

1. **MarketplaceBrowsePage** - Replace/upgrade `marketplace-page.tsx`
   - Fetch strategies from `GET /api/marketplace/listings`
   - Filter sidebar or bar (category, risk level, search)
   - Sort controls (by sharpe, drawdown, win rate, subscribers)
   - Paginated card grid
   - Subscribe CTA on each card

2. **MarketplaceDetailPage** (new route, e.g., `/app/strategies/:id`)
   - Full strategy detail with metrics, backtest stats, reviews
   - Subscribe button/modal

3. **MySubscriptionsPage** (new route, e.g., `/app/strategies/subscriptions`)
   - List of active/paused/cancelled subscriptions
   - Allocation controls, pause/cancel actions

4. **PublishStrategyPage** (new route or modal)
   - Form to publish a strategy (name, description, category, risk level, allocation range, backtest results)

### New Component Files (under `/Users/macbook/algo-trader/dashboard/src/components/`)

- `marketplace-card.tsx` - Strategy card with stats, status badge, subscribe CTA
- `marketplace-filters.tsx` - Category/risk/sort filter bar
- `marketplace-subscription-card.tsx` - Subscription management card
- `subscribe-modal.tsx` - Subscribe modal (allocation, risk limits)
- `marketplace-search.tsx` - Search input

### New Hooks (under `/Users/macbook/algo-trader/dashboard/src/hooks/`)

- `use-marketplace.ts` - List strategies with filters/pagination/sort (analogous to `use-licenses.ts`)
- `use-strategy.ts` - Single strategy detail
- `use-subscriptions.ts` - List/subscribe/manage subscriptions

### New Store (under `/Users/macbook/algo-trader/dashboard/src/stores/`)

- `marketplace-store.ts` - Optional: cache listings, selected filters, subscriptions (Zustand, non-persisted)

### Router Updates (`App.tsx`)
- `/app/strategies` -> MarketplaceBrowsePage (replace static page)
- `/app/strategies/:id` -> MarketplaceDetailPage
- `/app/strategies/subscriptions` -> MySubscriptionsPage
- `/app/strategies/publish` -> PublishStrategyPage (or modal-based)

### Data Types (`types/api.ts`)
- Add marketplace types: `StrategyListing`, `Subscription`, `Review`, `MarketplaceFilters`, etc. (mirroring backend schemas)

### Sidebar Update (`sidebar-navigation.tsx`)
- Optionally add "My Subscriptions" sub-nav or badge

---

## 10. Key Points to Follow

- **Naming:** kebab-case file names (already: `marketplace-page.tsx`, `use-licenses.ts`)
- **Component pattern:** Named export function + default export, no class components
- **Data fetching:** Hook pattern with `useApiClient().fetchApi<T>()`, `useState` for data/loading/error, `useCallback` for actions, `useEffect` for initial load
- **Styling:** Tailwind with custom design tokens (bg, accent, profit, loss, muted, border, card colors)
- **State:** Zustand for global/UI state, React hook state for page-local data
- **Routing:** `react-router-dom` v7 declarative routes
- **Auth guard:** Already handles session; marketplace routes go inside `<AuthGuard>`
- **No lazy loading currently** - all pages eagerly imported in `App.tsx`
- **No React Query** - all custom hooks with raw fetch
- **No icon library** - inline SVG paths
