# Code Review — Pillar 2 Observability (L-tier gauges + OTLP tracing)

**Date:** 2026-04-17
**Plan:** `plans/260417-1700-pillar-2-observability/plan.md`
**Scope:** 7 files, ~600 LOC net diff
**Verdict:** **7.8 / 10** — blocking Major issues found; fix before merge.

---

## Scope

- `src/middleware/prometheus-metrics.ts` (+53 LOC, 3 gauges + 3 helpers)
- `src/utils/tracing.ts` (rewrite, 91 LOC)
- `src/wiring/qwen-drawdown-monitor.ts` (+span wrap + 2 gauge sets)
- `src/wiring/qwen-live-eligibility-gate.ts` (+span wrap + 1 gauge set)
- `src/wiring/qwen-signals-loop.ts` (+span wrap)
- `src/wiring/__tests__/qwen-observability.test.ts` (NEW, 6 tests, 95 LOC)
- `docker/grafana/dashboards/qwen-solo-platform.json` (NEW, 204 LOC)
- `package.json` — 3 deps added; 1 moved (**see Major #1**)
- 3 dependent test files (mock updates — correct)

LOC: compiles clean `tsc --noEmit` exit 0. `qwen-observability.test.ts` 6/6 pass locally. No `any`, no `@ts-ignore`, no `console.*` in new code.

---

## Score Breakdown /10

| Dimension | Score | Note |
|---|---|---|
| Correctness | 7 | Prod wiring gap (Major #2) + dep placement (Major #1) |
| Safety | 8 | Zero-risk when endpoint unset ✅; gauge clamping correct |
| Readability | 9 | Good comments, clear separation of concerns |
| Test coverage | 8 | Edge cases solid; missing: SDK-load failure noop fallback, span exception path |
| Docs | 8 | Changelog/roadmap/architecture updated; no inline wiring doc for `initTracing` call-site |

**Weighted:** 7.8/10 (correctness 0.35 × 7 + safety 0.25 × 8 + readability 0.15 × 9 + tests 0.15 × 8 + docs 0.10 × 8).

---

## Blocking Issues

### [Major #1] OTel runtime deps in `devDependencies` → spans ALWAYS no-op in prod

`package.json`:
```
devDependencies:
  @opentelemetry/api ^1.9.0
  @opentelemetry/sdk-trace-node ^2.6.1
```
But `tracing.ts:54-57` **dynamically imports these at runtime** from production code paths (`qwen-drawdown-monitor`, `qwen-live-eligibility-gate`, `qwen-signals-loop`). After `pnpm install --prod` / CF Pages prod build, `import('@opentelemetry/api')` throws `ERR_MODULE_NOT_FOUND` → caught silently → `logger.warn('SDK unavailable')` → `_tracer` stays noop.

The operator sets `OTEL_EXPORTER_OTLP_ENDPOINT=...` in prod and gets **zero spans + one warning line**.

**Fix:** Move `@opentelemetry/api` and `@opentelemetry/sdk-trace-node` into `dependencies` (alongside the already-correct `exporter-trace-otlp-http`). Also verify `@opentelemetry/resources` and `@opentelemetry/semantic-conventions` aren't needed at runtime — if tracing.ts doesn't import them they can stay out.

### [Major #2] `initTracing()` is never called from any prod entry point

`grep -rn initTracing src/` hits only `tracing.ts` itself and the test file. No `src/app.ts`, `src/index.ts`, `src/engine.ts`, `src/trading-pipeline.ts` imports it.

Consequence: AC #1 ("OTEL endpoint set → spans export via OTLP HTTP") is not met in any live deployment. Spans are always noop.

**Fix:** Add `await initTracing();` to the top of the main bootstrap (pick one that runs before first Qwen span — likely `src/app.ts` or wherever express/hono is wired) or to the Qwen monitor start path (`startDrawdownMonitor`, `startSignalsLoop`). Pick ONE top-level call — avoid sprinkling. Add a test that verifies it's called during bootstrap.

---

## Minor

### [Minor #1] `initTracing` race window sets `_initialized=true` before async load

`tracing.ts:47-48`:
```
if (_initialized) return;
_initialized = true;          // ← set BEFORE Promise.all resolves
...
await Promise.all([...]);
```
If two callers invoke `initTracing()` concurrently during startup, the second returns immediately while the first is still loading the SDK. Spans emitted during that window hit `noopTracer`. In practice `initTracing` is called once at boot so this won't bite, but the idempotency test (L73-79) only covers the unset-endpoint path, not the concurrent-load path.

**Fix:** Cache the in-flight promise: `let _initPromise: Promise<void> | null; export function initTracing() { return _initPromise ??= doInit(); }`. Low urgency.

### [Minor #2] SDK-load failure path not tested

`tracing.ts:82-84` catches errors from the dynamic import and logs a warn. Test suite covers: endpoint unset (noop ✅), endpoint set + SDK loads ✅. Missing: endpoint set but SDK throws (e.g. corrupt install) — should still fall through to noop without crashing. Easy to add via `vi.mock` that rejects.

### [Minor #3] Span finalization in noopTracer mismatches real tracer

`noopTracer.startActiveSpan` does **not** call `end()` on the span (spans are noop, doesn't matter functionally), but the real tracer wrapping at L67-78 does `finally { span.end() }`. This divergence is fine for behaviour but makes the two code paths harder to compare. Consider having the noop path also call `span.end()` for symmetry.

### [Minor #4] `setQwenPaperGateDaysRemaining` rounding choice is quiet

`prometheus-metrics.ts:299`:
```
const clamped = Math.max(0, Math.min(30, Math.round(days * 10) / 10));
```
Rounds to 1 decimal (test expects `12.345 → 12.3`). Clamping order: round then clamp — fine for values in [0,30], but `Math.round(-3 * 10) / 10 = -0.3` → then clamped to 0. Correct but could be simpler: `Math.max(0, Math.min(30, days))` then round. Not a bug — just more conditional paths than needed.

### [Minor #5] Dashboard P&L threshold steps look inverted

`qwen-solo-platform.json:128-133`:
```
"steps": [
  { "color": "red",    "value": null },
  { "color": "orange", "value": -5   },
  { "color": "green",  "value": 0    }
]
```
Grafana steps must be monotonically ascending. This reads as: below `-5`% → red, `-5` to `0` → orange, `≥ 0` → green. That's correct semantically, but `value: null` as the floor is Grafana's required idiom. Verify in Grafana v10 preview — some renderers require the null step first with a specific color convention. Low risk.

### [Minor #6] Files over 200-LOC target

| File | LOC | Target | Gate 3 soft warn |
|---|---|---|---|
| `prometheus-metrics.ts` | 309 | 200 | within (<400) |
| `qwen-signals-loop.ts` | 277 | 200 | within |

Both were already over before this PR; incremental adds are small. Consider extracting `qwen-*` gauges into `src/middleware/metrics/qwen-metrics.ts` module in a follow-up.

---

## Nit

### [Nit #1] Cardinality check

`qwenKillSwitchActive{source}` has cardinality `{env, kv}` = 2. ✅ Bounded. No concern.

Span attributes are all bounded (`qwen.enabled` bool, `qwen.pnl_pct` number, `qwen.source` string = `qwen-m1max` singleton, `qwen.decision` enum, `qwen.drawdown.breach` bool). ✅ No high-cardinality labels.

### [Nit #2] Dashboard metric cross-check — all 8 panels reference existing metrics

Verified:
- `algo_trader_qwen_kill_switch_active{source=env|kv}` ✅
- `algo_trader_qwen_drawdown_auto_disabled` ✅
- `algo_trader_qwen_paper_gate_days_remaining` ✅
- `algo_trader_qwen_paper_pnl_pct` ✅ (existing from prior PR)
- `algo_trader_qwen_signals_total` ✅ (existing)
- `algo_trader_qwen_signals_loop_runs_total` ✅ (existing)
- `algo_trader_qwen_strategy_reviews_queued_total` ✅ (existing)

Dashboard JSON is internally consistent. Grafana v10 schemaVersion=39 is valid.

### [Nit #3] Gauge naming consistency

All new metrics correctly use `algo_trader_qwen_*` prefix. ✅

### [Nit #4] Edge case: `enableQwen` path's gauge reset

`qwen-drawdown-monitor.ts:58-63`:
```
export function enableQwen(): void {
  _qwenEnabled = true;
  _lastBreachAt = null;
  setQwenDrawdownAutoDisabled(false);  // ← resets gauge
}
```
Correct — re-enable flips gauge back to 0. ✅

`disableQwen` also sets gauge to 1. ✅

But: `setQwenKillSwitch('env', ...)` is only called inside `runDrawdownCheck` (L114). If the timer is paused (e.g. in tests where `runDrawdownCheck` hasn't fired), the gauge remains stale at its last value. Consider calling it once during `startDrawdownMonitor()` for immediate freshness. Low importance.

---

## Positive Observations

- Clean noop pattern in `tracing.ts` — default behaviour guarantees zero prod risk.
- Gauge helpers (`setQwenKillSwitch`, `setQwenPaperGateDaysRemaining`, `setQwenDrawdownAutoDisabled`) are single-responsibility and well-documented.
- Test file is focused and exercises clamp boundaries (42, -3, 12.345).
- Dashboard layout maps cleanly to L1/L3/L4 rollback tiers — scannable at a glance for solo ops.
- Span attributes carefully bounded — no leaked user input or high-card labels.
- All existing test mocks updated in the same PR (rollback-harness, signals-loop, e2e-integration) — no broken regression surface.

---

## Recommended Actions (ordered)

1. **[Major #1]** Move `@opentelemetry/api` + `@opentelemetry/sdk-trace-node` from `devDependencies` → `dependencies` in `package.json`. Re-run `pnpm install`. **Blocking.**
2. **[Major #2]** Wire `await initTracing();` into the main bootstrap entry point. Add a test asserting it's invoked before any Qwen span path. **Blocking.**
3. [Minor #1] Cache in-flight promise in `initTracing` to eliminate race window.
4. [Minor #2] Add a test that mocks `@opentelemetry/sdk-trace-node` to throw, confirming noop fallback.
5. [Minor #6] Schedule follow-up: extract Qwen gauges to dedicated module when file hits 400 LOC.

After 1 + 2 fixed, expected score: **9.2 / 10**. Ship-ready.

---

## Verdict

**Score: 7.8 / 10 — below 9.0 threshold.** Two Major issues block PR merge:

1. OTel runtime deps placement.
2. `initTracing` never called from prod.

Both are small fixes (2-line `package.json` move, 1-line bootstrap import). No architectural rework needed. Re-review after fixes is fast.

Tests currently pass because dev env has all deps installed and the test suite calls `initTracing` directly. Prod path gap only manifests at deploy time.

---

## Unresolved Questions

1. Which bootstrap file owns `initTracing()` — `src/app.ts`, `src/engine.ts`, or a new top-level? Author should decide based on which runs before first Qwen timer fires.
2. Does CF Pages deployment target include `devDependencies` by default? (If yes, Major #1 softens to Minor; but AMD64 container / node server deploys typically prune dev deps.)
3. Follow-up PR for alert rules per plan's non-goals — timeline?
