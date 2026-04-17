# Pillar 2 — Observability Completion (OTel spans + L-tier metrics + Qwen dashboard)

> Solo Platform a16z doctrine: Pillar 2 partial → complete. claudekit + mekong-cli style.
> Upstream: `CLAUDE.specification.md` (Phase 1 SDLC). Downstream: prod + Grafana alerts.

## Problem

Pillar 2 observability is half-wired:
- Prometheus metrics shipped 13 gauges/counters (PR #113/#114).
- Grafana stack (docker-compose monitoring override) exists with 3 generic dashboards.
- OTel SDK deps installed, but `src/utils/tracing.ts` only registers `NodeTracerProvider` — no OTLPTraceExporter, no spans anywhere in prod paths.
- L0–L4 rollback state (kill-switch, paper gate days remaining, drawdown auto-disabled) is **not visible in metrics** — Grafana can't alert on rollback engagement.

Close the gap. Keep it solo-ops tight.

## Acceptance criteria

1. `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces` → spans export via OTLP HTTP; unset → silent noop (no crash, no log spam).
2. `src/wiring/qwen-signals-loop.ts`, `qwen-drawdown-monitor.ts`, `qwen-live-eligibility-gate.ts` each produce named spans for their critical function.
3. Three new Prometheus gauges exposed at `/metrics`:
   - `algo_trader_qwen_kill_switch_active{source}` (0|1, labels: `env`, `kv`)
   - `algo_trader_qwen_paper_gate_days_remaining` (0–30 number)
   - `algo_trader_qwen_drawdown_auto_disabled` (0|1)
4. `docker/grafana/dashboards/qwen-solo-platform.json` provisioned with panels for all 4 Qwen metrics + 3 new L-tier gauges.
5. Tests: vitest suite 100% green; new test file covers (a) exporter wiring when endpoint set, (b) noop when unset, (c) each new gauge exposed.
6. Dashboard JSON is valid Grafana v10 schema.
7. All 5 CI gates green on PR.

## Non-goals

- No OpenTelemetry logs/metrics SDK (only traces).
- No alertmanager config — Grafana alert rules come in a later PR.
- No new LLM span instrumentation (llm-router.ts untouched).
- No sampling strategy tuning (default parent-based).

## Risk surface

- **L0 static:** CI gates must pass. File sizes kept ≤200 LOC target.
- **L0 dynamic:** Signals Loop journal unchanged — new spans wrap, don't replace, business logic.
- **L1 kill:** new `qwen_kill_switch_active` gauge reflects `QWEN_KILL` env state; does not control it.
- **L2 swarm:** unchanged.
- **L3 drawdown:** `qwen_drawdown_auto_disabled` gauge is read-from internal state, does not disable.
- **L4 paper gate:** `qwen_paper_gate_days_remaining` reads `paper_trades_v3` (existing query path); no migration needed.
- **Cost:** OTLP HTTP exporter is opt-in via env; default behaviour unchanged. Zero prod risk if env unset.

## Metrics (new)

| Name | Type | Labels | Set by |
| ---- | ---- | ------ | ------ |
| `algo_trader_qwen_kill_switch_active` | Gauge | `source` (`env` or `kv`) | `qwen-drawdown-monitor.ts::runDrawdownCheck` |
| `algo_trader_qwen_paper_gate_days_remaining` | Gauge | — | `qwen-live-eligibility-gate.ts::checkQwenEligibility` |
| `algo_trader_qwen_drawdown_auto_disabled` | Gauge | — | `qwen-drawdown-monitor.ts::disableQwen/enableQwen` |

## Rollback plan

- **L0 static (CI):** if any gate fails, PR blocked.
- **Revert path:** `git revert 172072b` equivalent; new gauges are additive — removing them doesn't break existing scrapes.
- **Kill switch:** OTLP exporter disabled by leaving `OTEL_EXPORTER_OTLP_ENDPOINT` unset; no process-level kill needed.

## Files

**Create:**
- `docker/grafana/dashboards/qwen-solo-platform.json`
- `src/wiring/__tests__/qwen-observability.test.ts`
- `plans/260417-1700-pillar-2-observability/plan.md` (this file)

**Modify:**
- `src/utils/tracing.ts` — wire OTLPTraceExporter + BatchSpanProcessor (≤100 LOC total)
- `src/middleware/prometheus-metrics.ts` — 3 new gauges + helper setters
- `src/wiring/qwen-signals-loop.ts` — wrap `evaluateAndQueue` in span
- `src/wiring/qwen-drawdown-monitor.ts` — wrap `runDrawdownCheck` in span; set 2 L-tier gauges
- `src/wiring/qwen-live-eligibility-gate.ts` — wrap `checkQwenEligibility` in span; set paper-gate-days gauge
- `package.json` — add `@opentelemetry/exporter-trace-otlp-http`
- `docs/development-roadmap.md` — flip Pillar 2 status to ✅
- `docs/project-changelog.md` — v2.4.0 entry
- `docs/system-architecture.md` — add Pillar 2 observability subsection

## Tasks

- [x] 54. Scout + plan
- [ ] 55. Add 3 L-tier Prometheus gauges
- [ ] 56. Wire OTLPTraceExporter
- [ ] 57. Instrument 3 Qwen paths with spans
- [ ] 58. Create Grafana dashboard JSON
- [ ] 59. Write observability tests
- [ ] 60. Tester + code-reviewer subagents
- [ ] 61. PR, merge, verify, 11-line report

## Unresolved questions

- Should OTLP exporter default to `http://localhost:4318/v1/traces` if grafana monitoring stack is up locally? Decision: **no**, require explicit env (safer default for CF Pages prod where endpoint isn't reachable).
- Add `@opentelemetry/resources` for service.name attribution? Deferred — out of scope.
