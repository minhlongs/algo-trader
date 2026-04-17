# code-reviewer — Grafana alert provisioning PR

Branch: `pillar-2-grafana-alerts-260417` · 7 files · 19/19 tests pass · **Score 9.2/10** · **APPROVE with 1 nit**

## Verdict
Ship. Schema + PromQL + secret handling all correct. Zero blocking issues.

## PromQL correctness
- L3 `algo_trader_qwen_drawdown_auto_disabled > 0.5` — gauge is 0|1, `> 0.5` is idiomatic for binary gauge. ✅
- L4 `algo_trader_qwen_paper_gate_days_remaining <= 5` — `lte 5` matches gauge semantics (clamped 0–30). ✅
- signals-loop `increase(...{decision="error"}[1h]) >= 2` — decision label exists in metric def (line 51), cardinality fine. ✅
- L1 `algo_trader_qwen_kill_switch_active{source="env"}` — metric has `source` label `env|kv`, scoping to `env` is correct (kv path not wired yet per src/middleware/prometheus-metrics.ts). ✅

## Thresholds
- L3 5m for-duration: reasonable (latch on breach, manual re-enable). ✅
- L4 10m on ≤5d: low-noise early warning. ✅
- signals-loop 15m sustain: filters single-tick flaps without missing drift. ✅
- L1 1m: near-instant ops visibility on kill-switch toggle. ✅

## Secret handling
- `${TELEGRAM_BOT_TOKEN}` / `${TELEGRAM_CHAT_ID}` env expansion is Grafana 10.4 standard syntax. ✅
- docker-compose.monitoring.yml forwards both vars with `:-` default to empty. ✅
- No hardcoded tokens in YAML. Test line 149–150 locks this invariant. ✅

## Cross-file integrity
- Policy `receiver: qwen-telegram-admin` matches contact-point name. Test line 186–195 locks this. ✅
- Route matcher `component = qwen` matches labels on every rule. ✅
- No orphan refs.

## Rollback / empty-env behavior
- If `TELEGRAM_BOT_TOKEN=""`, Grafana provisions the contact point but Telegram send fails at runtime (logged, not fatal). Grafana keeps firing alerts visible in UI. ✅ Safe rollback.
- Provisioning is `:ro` mount — Grafana restart re-applies YAML; removing files unprovisions via `deleteRules`/equivalent not set (nit).

## Nit (non-blocking)
1. **No `deleteRules`/`deleteContactPoints`/`deletePolicies` sections** — removing a rule from YAML won't unprovision it from Grafana DB (stays orphaned until manual delete). Add empty `deleteRules: []` stub for future-proofing, or document in runbook.

## Positive
- Runbook URLs in annotations (3/4 rules). 
- Templated Telegram message includes severity + tier + runbook — operator-friendly.
- 19 smoke tests lock schema + cross-refs without needing Grafana container.
- Labels (`component`, `severity`, `rollback_tier`) align with PDF doctrine for future grouping/silence rules.
- File sizes: qwen-alerts 173 LOC (config YAML, exempt from 200-LOC rule per development-rules.md).

## Metrics
- TS compile: clean · Tests: 19/19 · Linting: N/A (YAML) · Type coverage: N/A

## Unresolved questions
- Should L4 `noDataState: NoData` fire a meta-alert? Currently silent when metric stops scraping (masking Prometheus outage). Consider `Alerting` instead if paper-gate metric is load-bearing.
- Runbook markdown files (`docs/runbooks/qwen-*.md`) referenced in annotations — do they exist yet? If not, 404s on Telegram click-through.
