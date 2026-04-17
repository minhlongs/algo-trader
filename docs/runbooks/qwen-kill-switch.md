# Runbook: Qwen L1 Kill-Switch Active (L1)

**Alert:** `qwen-l1-kill-switch-active` — Grafana → Telegram admin channel.
**Metric:** `algo_trader_qwen_kill_switch_active{source="env"} == 1` for ≥1m (NoData = OK).
**Severity:** INFO.

## What happened
L1 env kill-switch is active — `QWEN_KILL=1` is set OR the CF KV lookup returned `kill=true`. All Qwen signals are blocked at the swarm layer. This is operator-initiated — the alert is informational, confirming the switch propagated. Pair counter: `algo_trader_qwen_admin_kill_actions_total{action}` records the mutation events.

## Immediate actions (first 5 min)
1. **Confirm it was intentional**: grep recent operator activity or ask in admin channel. Cross-check audit counter:
   ```bash
   ./scripts/qwen-ops.sh status
   ```
2. **If intentional**: no action — alert will auto-clear when the switch is released. Close the Telegram notification.
3. **If unintentional** (env leaked, deploy misconfig, or external KV flipped without operator intent): proceed to remediation.

## Root cause analysis
- **Env flag** — `QWEN_KILL=1` baked into process env. Inspect container/PM2/launchd definition.
- **CF KV flip** — admin API `POST /admin/qwen/kill` flipped KV without operator recall. Check `qwen_admin_kill_actions_total{action="kill"}` delta vs `..._total{action="unkill"}`.
- **Deploy regression** — new release shipped with kill default on. Check latest commit for `QWEN_KILL` changes.

## Remediation
- **If env flag**: unset `QWEN_KILL` in the process env (PM2 `ecosystem.config.cjs`, launchd plist, or docker-compose env block) + restart. Env-sourced kill requires process restart to clear — no admin API path.
- **If KV flip**: `./scripts/qwen-ops.sh unkill` (admin-key required).
- **If deploy regression**: revert the offending commit, ship hotfix, then unkill as above.

## Verification
- [ ] `algo_trader_qwen_kill_switch_active{source="env"}` returns 0.
- [ ] `algo_trader_qwen_kill_switch_active{source="kv"}` returns 0.
- [ ] `./scripts/qwen-ops.sh status` shows `kill_active=false`.
- [ ] Alert auto-clears within 1-2 scrape intervals (~30s after gauge drops).

## Escalation
If kill flips repeatedly without operator action → investigate unauthorized admin-key usage or a cron/script hitting the admin endpoint. Rotate `ADMIN_API_KEY` via env + redeploy as defensive step.

## Related
- `qwen-drawdown-breach.md` — L3 auto-disable also blocks Qwen, but via a different gauge (`qwen_drawdown_auto_disabled`). Do not confuse the two.
- `../strategy-review-reasons.md` — canonical trigger enum for signals-loop review queue.
