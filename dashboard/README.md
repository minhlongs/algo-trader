# CashClaw Dashboard

Real-time algorithmic trading dashboard for the [Algo Trader](https://github.com/billwill/algo-trader) platform. Provides live positions, P&L analytics, spread opportunities, trade history, and admin controls for Polymarket market-making strategies.

## Prerequisites

- Node.js 22+
- pnpm (install via `npm install -g pnpm`)

## Setup

```bash
cd dashboard
pnpm install
```

Create `.env`:

```env
VITE_API_URL=http://localhost:4000   # Fastify backend URL
VITE_WS_URL=ws://localhost:4000      # WebSocket endpoint
```

## Development

```bash
pnpm dev          # Vite dev server on port 5173
```

The dashboard proxies API/WS requests to the backend. Start the backend separately:

```bash
cd ..
pnpm api:serve    # Fastify API server on port 4000
```

## Build & Deploy

```bash
pnpm build        # Production build to dist/
pnpm preview      # Preview production build
```

Deploy `dist/` as static files behind the backend (or serve via Cloudflare Pages).

## Architecture

| Layer | Tech |
|-------|------|
| Framework | React 19, TypeScript |
| Build | Vite 6 |
| State | Zustand stores (auth, trading) |
| Styling | Tailwind CSS v4 |
| Realtime | WebSocket (React hooks) |
| API | Fastify backend, JWT auth |

### Key files

- `src/lib/api-client.ts` — API client with retry, timeout, JWT
- `src/stores/` — Zustand stores for auth and trading state
- `src/hooks/` — WebSocket, API, P&L, signal hooks
- `src/components/` — UI components: layout, panels, charts, tables
- `src/pages/` — Route page components

### WebSocket channels

- `/ws/prices` — Real-time price ticker
- `/ws/trades` — Trade execution feed
- `/ws/positions` — Position updates
- `/ws/health` — System health status

## Related

- Main project: [Algo Trader](../README.md)
- Backend API: `/api/v1` routes in `src/platform/api/`
