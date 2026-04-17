# Phase 04 — Paper-Gate Integration + Rollback Harness

## Context Links

- File: `/Users/macbookprom1/algo-trader/src/wiring/paper-trading-orchestrator.ts`
- File: `/Users/macbookprom1/algo-trader/src/execution/dry-run-executor.ts`
- File: `/Users/macbookprom1/algo-trader/src/dashboard/paper-trading-pnl-tracker.ts`
- Depends: Phase 03 (Qwen signals flowing into D1)
- Memory context: `project_algotrade_paper_trading.md` — prior 14.6% edge stale; re-validate

## Overview

**Priority:** P1
**Status:** complete — PR #110 `ff3332c`
**Effort:** 3h
**Description:** Tag Qwen-origin signals with separate paper portfolio tracking. Enforce `MIN_PAPER_DAYS=30` hard gate before any live-money flag accepts Qwen signals. Wire kill switch `SWARM_QWEN_ENABLED=0` and auto-disable rule (P&L drawdown >5% in 24h).

## Key Insights

- **Paper-gate already exists:** orchestrator has `POSITION_SIZE_PCT=0.05`, `MIN_AI_CONFIDENCE=0.7`. Qwen just adds a source dimension.
- **Separate P&L ledger:** Qwen signals tracked independently so we can cleanly compute "Qwen edge" vs "DeepSeek edge" for A/B decision.
- **$500 auto-approve threshold** (from a16z Phase 03): retained as `QWEN_AUTO_APPROVE_MAX_USD=500`. Larger trades require human sign-off (surfaced via Telegram alert, not auto-executed).
- **30-day rule is HARD-CODED**, not env-configurable. Prevents accidental override.

## Requirements

**Functional:**
- Signals with `strategy='qwen-m1max-v1'` flow into existing paper orchestrator
- `paper_trades_v3` schema extended with `source VARCHAR(32)` column (values: `deepseek`, `qwen`, `swarm`, `manual`)
- Dashboard gains separate "Qwen P&L" card alongside existing "Overall P&L"
- Auto-kill rule: if 24h rolling P&L for `source='qwen'` ≤ -5%, set `SWARM_QWEN_ENABLED=false` runtime flag + alert Telegram admin chat
- Live-trade guard: reject any `executeOrder()` call where signal source=qwen AND signal age <30 days from first Qwen signal timestamp

**Non-functional:**
- Feature flag atomic (no race conditions during auto-disable)
- Metric emitted: `algo_trader_qwen_paper_pnl_pct{window="24h"}`

## Architecture

```
Signal (strategy='qwen-m1max-v1') 
   ↓
paper-trading-orchestrator.ts
   ├─ record to paper_trades_v3 (source='qwen')
   ├─ dry-run-executor (NO real order)
   └─ reflection + P&L
        ↓
qwen-paper-gate-monitor.ts (NEW)
   ├─ every 5min: SELECT P&L WHERE source='qwen' AND ts > now-24h
   ├─ if pnl_pct < -0.05 → disable swarm persona + Telegram alert
   └─ expose metric

Live-trade guard (NEW in dry-run-executor.ts)
   if (signal.source === 'qwen' && qwenFirstSignalAgeMs < 30d_ms) {
     reject('Qwen source requires 30d paper validation')
   }
```

## Related Code Files

**Modify:**
- `src/wiring/paper-trading-orchestrator.ts` (~30 LOC added) — accept `source` field on signal, persist to new column
- `src/execution/dry-run-executor.ts` (~20 LOC added) — 30d guard for qwen-source signals
- `src/dashboard/paper-trading-pnl-tracker.ts` (~25 LOC added) — compute per-source P&L
- `src/db/migrations/016_qwen_source_tracking.sql` (NEW) — add `source` column + index on `(source, ts)`

**Create:**
- `src/monitoring/qwen-paper-gate-monitor.ts` (~90 LOC) — 5min cron, drawdown detection, auto-disable
- `src/monitoring/__tests__/qwen-paper-gate-monitor.test.ts` (~120 LOC) — drawdown scenarios, kill-switch, Telegram alert mock

**Modify (dashboard):**
- `dashboard/src/components/PaperPnlCard.tsx` or similar — render separate Qwen section
- `dashboard/src/api/pnl-queries.ts` — group-by source

**Do NOT modify:**
- `signal-publisher.ts` (stays source-agnostic; `strategy` field carries the tag)
- Any existing non-Qwen signal flow

## Implementation Steps

1. **DB migration** `016_qwen_source_tracking.sql`: `ALTER TABLE paper_trades_v3 ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'legacy'; CREATE INDEX idx_paper_trades_source_ts ON paper_trades_v3(source, ts);`
2. **Orchestrator** — in `savePaperTrade()`, derive `source` from `signal.strategy` prefix (`qwen-*` → qwen, `deepseek-*` → deepseek, fallback `legacy`). Persist.
3. **dry-run-executor** — add `assertPaperGateClearedForSource(signal)` helper. Reads `SELECT MIN(ts) FROM paper_trades_v3 WHERE source='qwen'`. If age <30d → throw `PaperGateError`.
4. **qwen-paper-gate-monitor.ts**:
   - `startMonitor(intervalMs=300000)` — setInterval guard
   - `computeRollingPnl(source, windowMs)` — pure SQL
   - `onBreach()` — set in-memory flag + `telegramSignalPusher.sendAdminAlert()` + prom metric
   - Singleton exported for tests to reset
5. **Dashboard**: add "Qwen 24h P&L" card — shows pct + count + first-signal-age
6. **Tests** (`qwen-paper-gate-monitor.test.ts`): drawdown below -5% triggers disable; above does not; admin alert sent exactly once per breach; auto-reset after 6h cooldown
7. **Wire startup**: in `src/app.ts` or `src/index.ts`, call `qwenPaperGateMonitor.start()` if `SWARM_QWEN_ENABLED=true`
8. Run full test suite: `pnpm test`
9. Commit: `feat(qwen): paper-gate source tracking + 30d live-trade guard + auto-kill monitor`

## Todo List

- [x] Migration `016_qwen_paper_tracking.sql` created (signals.source + paper_trades_v3)
- [x] Orchestrator persists `source` field + writes paper_trades_v3
- [x] L4 gate in `qwen-live-eligibility-gate.ts` (30d hardcoded + $500 cap)
- [x] `qwen-drawdown-monitor.ts` — L3 auto-disable + Telegram alert
- [x] `signal-store-d1.ts` — real D1 store replaces Phase 03 stub
- [x] `admin-qwen-routes.ts` — L1 kill switch + status endpoints
- [x] Tests: 23 scenarios across all 4 rollback layers, all pass
- [x] Commit ff3332c on feat/qwen-paper-gate-rollback-phase04
- [ ] Dashboard card renders Qwen P&L separately (deferred to Phase 05)
- [ ] Metric `algo_trader_qwen_paper_pnl_pct` emitted (deferred to Phase 05)

## Success Criteria

- DB: `SELECT DISTINCT source FROM paper_trades_v3` shows `['qwen','deepseek','legacy']` after 1 day running
- Attempting live trade on qwen-source signal <30d old throws `PaperGateError`
- Simulated -6% 24h drawdown auto-disables Qwen persona (flag + Telegram)
- All 211+ tests pass + 6 new gate-monitor tests pass
- Dashboard shows separate Qwen P&L card

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Auto-disable flaps (disable→re-enable loops) | Medium | 6h cooldown before re-enable; manual re-enable only first 72h |
| 30d guard too strict during emergency bugfix | Low | Bypass requires `QWEN_PAPER_GATE_OVERRIDE=<admin-sig>` — NOT env-toggleable; signed only by admin PR |
| P&L calc edge case (open positions) | Medium | Use mark-to-market via existing pricer; add test for open-position scenario |
| Migration downtime | Low | `ADD COLUMN` with DEFAULT is instant on D1 |

## Security Considerations

- `QWEN_PAPER_GATE_OVERRIDE` secret NEVER in `.env.example` — operator-only
- Admin alert Telegram chat uses existing admin chat ID (reuse, don't add new secret)
- Metrics exposed on `/metrics` — ensure Prom scraper has auth (existing setup)

## Next Steps

- Phase 05: test suite + CI + docs sync
- Post-merge: 30-day observation clock starts. NO live-money flag flip until clock expires AND P&L positive.
