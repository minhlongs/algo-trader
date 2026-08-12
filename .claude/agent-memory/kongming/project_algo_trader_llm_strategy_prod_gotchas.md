---
name: algo-trader-llm-strategy-prod-gotchas
description: Traps to re-check before advising on taking any new LLM-based trading strategy (llm-assisted, or future ones) to production in algo-trader
metadata:
  type: project
---

When advising on production rollout for LLM-assisted strategies (first case: `llm-assisted`,
`src/strategies/llm-trading-strategy.ts`, registered in `src/desk/strategies/loader.ts`), verify
these before trusting "tests pass = ready":

1. **OmniRoute gateway (`http://omnimbp.local:20128/v1`) is a LAN-only mDNS address.** It only
   resolves on the same subnet as the M1 Max host. `LlmRouter`'s `assertOmniRouteConfig()`
   (`src/lib/llm-router.ts`) hard-throws unless every endpoint URL is exactly that literal string
   or a loopback address — it does not whitelist tunnel hostnames. `StrategyShard` is a Cloudflare
   Durable Object (`wrangler.toml` SHARD_0..11 bindings) and runs on Cloudflare's network, not the
   LAN. Net effect: any LLM strategy executed inside a deployed CF Worker will fail every gateway
   call, get silently swallowed by empty `catch` blocks in the strategy, and permanently run on
   its heuristic fallback with no alarm. Re-check this before claiming an LLM strategy is
   "integration tested" — unit tests here all stub the router, none hit the real gateway.
2. **The repo already has a full L1-L4 rollback stack for LLM signals, built for a strategy
   family named `qwen`** (`src/desk/wiring/qwen-live-eligibility-gate.ts` — 30-day paper gate +
   USD auto-approve cap; `qwen-drawdown-monitor.ts` — 6h cron, -5% 24h auto-disable + Telegram
   alert; `admin-qwen-routes.ts` — kill/unkill/status; `paper-trading-orchestrator.ts` — routes
   candidates through the gates). New LLM strategies should reuse/generalize this, not reinvent it.
3. **Wiring gap:** `deriveSource()` in `paper-trading-orchestrator.ts` buckets by strategy-name
   prefix (`qwen*`, `deepseek*`, `swarm*`, else `'legacy'`). A new strategy like `llm-assisted`
   falls into `'legacy'` and gets NONE of the qwen gates automatically. CI Gate 6
   (`scripts/ci-gate-paper-gate-lock.sh`) also hardcodes the string `QWEN_LIVE_ELIGIBLE` — a new
   `<NAME>_LIVE_ELIGIBLE` flag for another strategy is not covered by that gate unless added.
4. **`wrangler.toml` `[env.staging]` has no D1/KV/DO override** — staging deploys currently point
   at the same D1 database id as production (`SUBSCRIBERS` binding). Don't trust "tested in
   staging" for anything that writes to D1 without confirming DB isolation first. (Confirmed still
   true 2026-08-12: `[env.staging.vars]` only has ENVIRONMENT/NOWPAYMENTS_*/OMNIROUTE_URL, no
   `[env.staging.d1_databases]` block.)
5. **`OMNIROUTE_URL` env var (added to `llm-router.ts`'s `assertOmniRouteConfig()`) is NOT wired
   into `loadLlmConfig()` (`src/shared/config/llm-config.ts`).** Each endpoint has its own separate
   env var (`LLM_PRIMARY_URL`, `LLM_FAST_TRIAGE_URL`, `LLM_FALLBACK_URL`, `LLM_QWEN_URL`) that
   independently defaults to the hardcoded literal `http://omnimbp.local:20128/v1` — none of them
   read `OMNIROUTE_URL`. Net effect: the moment `OMNIROUTE_URL` is set to anything other than that
   exact literal (e.g. `wrangler.toml [env.staging.vars] OMNIROUTE_URL = "https://<tunnel-hostname>/v1"`,
   added 2026-08-12), `assertOmniRouteConfig()` throws `OmniRoute violation` synchronously in the
   `LlmRouter` constructor on every instantiation (not a silent fallback — a hard crash at
   construction). Confirmed by reading both files; `llm-router.test.ts` doesn't catch this because
   it manually constructs endpoints with `url: OMNIROUTE_URL` rather than going through
   `loadLlmConfig()`. Fix: either derive all `LLM_*_URL` defaults from `OMNIROUTE_URL` in
   `loadLlmConfig()`, or set all four `LLM_*_URL` vars to match `OMNIROUTE_URL` everywhere it's set.
6. **`admin-qwen-routes.ts` lives at `src/platform/api/routes/admin-qwen-routes.ts` AND
   `src/api/routes/admin-qwen-routes.ts`** (two copies, not `src/desk/wiring/` as previously
   recorded here — correcting that path). Check which one is actually mounted before extending the
   kill-switch route for a new strategy.
7. **5 duplicate `llm-config.ts` files exist**: `src/shared/config/llm-config.ts` (canonical —
   the only one `llm-router.ts` actually imports), `src/desk/config/llm-config.ts`,
   `src/desk/shared/config/llm-config.ts`, `src/desk/intelligence/config/llm-config.ts`,
   `src/deck/config/llm-config.ts`. A prior audit (`.orchestrate/latest/phase-6-finalize-audit-fixes.md`,
   CONDITIONAL PASS) shimmed some of these to re-export from a "canonical" file, but that file
   (`src/deck/shared/config/llm-config.ts`) is *not* the one `llm-router.ts` currently imports —
   verify which copy is live before trusting any of these are in sync.

**Why:** these are exactly the kind of gaps that make "tests pass, TS clean" look production-ready
while the strategy is actually inert (silently on heuristic fallback), unprotected (bypasses the
proven risk stack), or will hard-crash on construction the instant someone customizes an env var
that "should" be safe to set. Re-verify against current code each time — these are fixable and may
change.

**How to apply:** any time asked to advise/plan a new LLM strategy's production rollout in this
repo, check current state of these 7 points first rather than assuming the qwen pattern was
already generalized or that adding an env var to `wrangler.toml` alone wires anything up. See
[[algo-trader-ship-pipeline-toolchain-gap]] for the deploy/ship-pipeline side of this repo, and
[[algo-trader-public-repo-tracked-secret]] for an unrelated but co-located P0 secret finding.
