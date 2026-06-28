# Runbook: Qwen Paper Gate ≤5 Days (L4)

**Alert:** `QwenPaperGateLessThan5d` — Grafana → Telegram admin.
**Metric:** `algo_trader_qwen_paper_gate_days_remaining <= 5` for ≥10m.
**Severity:** WARNING.

## What happened
Qwen has been in the 30-day paper-validation window and **≤5 days remain** before it becomes eligible to trade live money. `MIN_PAPER_DAYS = 30` is hardcoded in `src/wiring/qwen-live-eligibility-gate.ts` (non-env-configurable by design).

## Pre-go-live checklist
Do not flip `QWEN_LIVE_ELIGIBLE=true` without all of:
- [ ] **7d win rate ≥ 40%** — check Grafana `qwen-solo-platform` → "Win Rate" panel.
- [ ] **7d Sharpe ≥ 0.5** (annualized) — same dashboard.
- [ ] **Zero open `strategy_review_tasks`** rows — `SELECT count(*) FROM strategy_review_tasks WHERE resolved_at IS NULL;` must = 0.
- [ ] **Zero L3 drawdown breaches in last 14d** — dashboard "L3 auto-disabled" panel must be clean.
- [ ] **≥30 closed paper trades** in last 7d — statistical power for Sharpe.
- [ ] **No open CI gate failures** on main branch.

## Going live
1. Set `QWEN_AUTO_APPROVE_MAX_USD=500` (or lower) — first-month live cap.
2. Set `QWEN_LIVE_ELIGIBLE=true` via Cloudflare secret (not `.env`).
3. Restart process (env var re-read on boot).
4. Verify `GET /api/admin/qwen/status` returns `eligible: true`.
5. Monitor first 24h of live trades closely. L3 drawdown monitor still active.

## If thresholds not met
- Do nothing. Gate stays closed. Alert will resolve when window extends past 5d (e.g., trades back-filled) or when window closes (metric clamps to 0 → alert stops firing).
- If quality is failing, queue `strategy_review_tasks` for human review before re-entering paper validation.

## Common gotcha
**Metric clamps at 0.** When the 30-day window is fully satisfied, `days_remaining` = 0. The alert uses `<= 5` so it fires at 0 too — this is intentional, it's the transition warning. Expected behavior: 5d alert → 0d alert → operator approves → alert resolves after `QWEN_LIVE_ELIGIBLE=true` + first live trade.
