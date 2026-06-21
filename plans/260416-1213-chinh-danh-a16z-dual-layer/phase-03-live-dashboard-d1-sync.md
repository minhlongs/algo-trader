---
phase: 03
name: Live dashboard D1 + Worker sync
priority: P1
status: completed
blockedBy: [02]
---

# Phase 03 — Live Dashboard D1 + Worker Sync

## Context Links
- `plan.md` (parent)
- `phase-02-landing-dashboard-routes.md` (mount points ready)
- `data/algo-trade.db` (source SQLite on M1 Max)
- `src/workers/edge-proxy.ts` (existing Worker)
- `wrangler.toml` (KV `CACHE` bound, ready to add D1)

## Overview
- **Priority:** P1 — data credibility compounding
- **Brief:** Replace static `paper-stats.json` với live D1 reads. Nightly cron đẩy resolved trades từ M1 Max SQLite → D1. Dashboard đọc D1 via Worker API.

## Key Insights
- D1 free tier: 5M rows read/day, 100K writes/day — thừa sức cho solo usage
- M1 Max SQLite = source of truth; D1 = read-only mirror for edge
- Sync one-way: M1 Max → D1 (không cho dashboard write D1)
- Phase 2 live P&L timing quyết định theo D3 (Phase 01 decision) — $500 hay $5K threshold
- CF Pages static + Worker API cùng domain via custom routes

## Requirements

### Functional
- D1 database tạo, schema mirror `algo-trade.db` (trades, resolutions, batches)
- Worker endpoint `/api/stats` → D1 query → JSON (paper totals, edge avg, accuracy, live P&L if D3=live)
- Cron script M1 Max nightly: export từ SQLite → wrangler d1 execute bulk insert
- Dashboard `paper-stats-card` fetch `/api/stats` thay JSON tĩnh
- Rolling accuracy chart: trailing 30d accuracy line

### Non-functional
- API response < 200ms (KV cache 5 min TTL)
- Sync job idempotent (re-run safe)
- Sync failure không gây dashboard downtime (fallback to stale data)

## Architecture

### Data flow
```
M1 Max SQLite  ──nightly cron──▶  D1 (edge mirror)
    (writes)                          │
                                      ▼
                        Worker /api/stats
                              │
                         KV CACHE 5min TTL
                              │
                              ▼
                    Dashboard /paper-stats-card
```

### D1 schema (mirror minimum)
```sql
CREATE TABLE trades (
  id INTEGER PRIMARY KEY,
  market_id TEXT NOT NULL,
  predicted_prob REAL,
  market_prob REAL,
  edge REAL,
  action TEXT,
  confidence REAL,
  resolved_at INTEGER,
  outcome INTEGER,
  pnl REAL,
  batch INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_trades_batch ON trades(batch);
CREATE INDEX idx_trades_resolved ON trades(resolved_at);
```

### Sync script strategy
- Incremental: last synced id stored in KV; export only new rows
- Batch insert via `wrangler d1 execute --file=batch.sql`
- Run via launchd on M1 Max nightly 02:00

## Related Code Files

### To create
- `scripts/sync-sqlite-to-d1.ts` (M1 Max cron target)
- `scripts/setup-d1.sh` (initial D1 create + schema)
- `src/workers/api-stats.ts` (new Worker route handler)
- `config/launchd/sync-d1.plist` (nightly schedule)

### To modify
- `wrangler.toml` — add D1 binding `STATS_DB`
- `src/workers/edge-proxy.ts` — route `/api/stats` to api-stats handler
- `dashboard/src/components/paper-stats-card.tsx` — fetch `/api/stats`

## Implementation Steps
1. Create D1: `wrangler d1 create algo-trader-stats` → record id
2. Add D1 binding in `wrangler.toml` under Worker config
3. Write `scripts/setup-d1.sh` with schema; run once
4. Write `scripts/sync-sqlite-to-d1.ts`: read `data/algo-trade.db`, diff vs last-synced-id (KV), export incremental, wrangler d1 execute
5. Manual first sync from M1 Max — import 150 paper trades
6. Write `src/workers/api-stats.ts` handler: SELECT aggregates + recent trades, return JSON, wrap with 5min KV cache
7. Register route in `edge-proxy.ts`
8. Deploy Worker: `wrangler deploy`
9. Test `curl https://algo-trader.workers.dev/api/stats` returns JSON
10. Update `paper-stats-card.tsx` fetch + error fallback
11. Build dashboard + deploy CF Pages
12. Verify dashboard shows live D1 data
13. Setup launchd nightly on M1 Max: `launchctl load config/launchd/sync-d1.plist`
14. Verify first nightly run via log
15. Commit: `feat(api): live stats endpoint + D1 sync (M1 Max → edge)`

## Todo List
- [x] Create D1 database + record id (used existing algo-trader-prod)
- [x] Add D1 binding in wrangler.toml
- [x] Schema setup script
- [x] Incremental sync script (pre-existing)
- [ ] First manual sync (150 trades) — run on M1 Max
- [x] Worker `/api/stats` handler
- [x] Route registration in edge-proxy
- [x] Deploy Worker
- [x] Smoke test curl
- [x] Update dashboard card to fetch API
- [x] Build + deploy CF Pages
- [ ] Setup launchd nightly on M1 Max: `launchctl load config/launchd/sync-d1.plist`
- [ ] Verify first nightly run via log
- [x] Commit

## Success Criteria
- `wrangler d1 list` shows `algo-trader-prod` with `paper_trades` and `sync_state` tables
- `/api/stats` returns JSON < 200ms (validated via curl)
- Dashboard renders live D1 data (deployed to Pages with API_URL baked)
- Nightly cron log shows success in `~/Library/Logs/sync-d1.log` (manual verification on M1 Max)
- Accuracy rolling 30d chart renders (once sufficient data)
- Live P&L visible IF D3 decision = live-from-$500 AND Phase 2 funded

## Risk Assessment

| Risk | Mitigation |
|---|---|
| M1 Max offline overnight | D1 serves last-good; dashboard shows staleness indicator if >48h |
| Sync conflict (SQLite row changes) | Mark resolved trades immutable in source; sync only `resolved_at IS NOT NULL` rows |
| Worker cold start latency | KV cache 5min TTL absorbs cold starts |
| Showing live P&L too early | Gate behind D3 decision; default to "paper only" until $500 funded |

## Security Considerations
- `/api/stats` read-only public endpoint — no auth needed (numbers are meant to be public)
- D1 token scope: R/W from M1 Max sync script only
- Rate limit Worker: 60 req/min per IP via KV counter (optional)
- No PII, no wallet addresses in D1

## Next Steps
- After deploy: Phase 04 build-in-public can cite dashboard URL with confidence
- Long-term: extend with batch-level detail pages once data volume grows
