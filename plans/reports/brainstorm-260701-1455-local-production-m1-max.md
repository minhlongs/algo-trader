# Brainstorm: Local Production on M1 Max 64GB

**Date:** 2026-07-01 | **Verdict:** GO | **Source:** /brainstorm không VPS

## Problem

No VPS available. Backend needs to run somewhere. User has M1 Max 64GB RAM — capable machine sitting idle. Need to serve API to CF Worker proxy so landing + dashboard work end-to-end.

## Decision

| Choice | Selected | Why |
|--------|----------|-----|
| DB | PostgreSQL local (Docker) | Full marketplace, billing, auth support |
| Tunnel | Cloudflare Tunnel | Free, encrypted, no open ports, native CF integration |
| Runtime | 24/7 always-on | Production reliability |

## Architecture

```
Internet → cashclaw.cc (CF Pages) ✅
Internet → dashboard (CF Pages)   ✅
Internet → CF Worker               ✅ → Cloudflare Tunnel → localhost:3000
                                              │
                                  ┌───────────┼───────────┐
                                  ▼           ▼           ▼
                              PostgreSQL    Redis       NATS
                              (Docker)     (Docker)    (Docker)
```

## Implementation

| Step | Action |
|------|--------|
| 1 | Add PostgreSQL service to `docker-compose.yml` |
| 2 | Create `.env.local` with `DATABASE_URL=postgresql://...` |
| 3 | Install `cloudflared` + create tunnel `algo-trader` |
| 4 | Point CF Worker backend to tunnel URL |
| 5 | Create `scripts/start-local-production.sh` |
| 6 | `docker compose up -d` + health verify |

## Cost

$0/month. M1 Max electricity only. CF tunnel free. All infra local.

## Risk

- Power/internet outage → app down. Acceptable for current stage.
- M1 sleep → Docker pauses. Fix: `caffeinate` + System Settings → prevent sleep.
- Port 5432 conflict if local PG already running.
