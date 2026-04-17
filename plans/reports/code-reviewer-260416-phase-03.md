# Code Review — Phase 03: Live D1 + Nightly Sync

**Branch:** `feat/phase-03-live-d1-sync` · **PR:** #103 · **Commit:** 5e9e582
**Scope:** 352 LOC across 9 files (Pages Function, sync script, D1 schema, launchd, UI card)
**Date:** 2026-04-16

---

## Overall Assessment

Clean, pragmatic KISS implementation. Architecture sound (D1 as state source, KV 5-min cache, INSERT OR REPLACE idempotency). Polar-safe vocabulary. No secrets leak in code. **One data-integrity bug in sync script will silently corrupt rows containing `|` or newlines in `market_question`/`reasoning`.** Recommend fix before enabling nightly cron.

---

## Critical Issues

### C1. `sqlite3 -separator "|"` breaks on embedded pipes/newlines in text fields

**File:** `scripts/sync-sqlite-to-d1.ts:25-29, 93`

`sqlite3` CLI emits `|`-separated output with **no quoting**. If any `market_question`, `reasoning`, `slug`, `category`, or `outcome` value contains `|` or a literal newline (very plausible for free-text market questions and LLM reasoning), `raw.split('\n')` and `line.split('|')` will produce wrong column counts, misaligned fields, and corrupted rows pushed to D1. `INSERT OR REPLACE` then clobbers good rows with garbage.

**Fix (one of):**
- Use `sqlite3 -json` and parse JSON (safest, native types preserved)
- Use `-csv` + a real CSV parser (handles quoting)
- Or use `-separator` with an ASCII control char like `\x1f` (unit separator) that cannot appear in text, then split on that

Recommend `-json` — simplest and removes all the `Number()` coercion gymnastics in `buildInsertSql`.

### C2. `esc()` single-quote escape is correct for SQL literals, BUT the whole approach is fragile

**File:** `scripts/sync-sqlite-to-d1.ts:50-54`

The escape itself (`'` → `''`) is sufficient for SQLite/D1 string literals — that part is safe against injection. **However:**
- `wrangler d1 execute --file` interprets the SQL as a script, so any unescaped backslash, null byte, or NUL in source data would cascade. SQLite string literals don't interpret backslashes, so OK there.
- If a source row has a `'` inside a `market_question` AND C1's pipe-splitting misaligns columns, `esc()` will happily wrap an attacker-controlled string — but this is your own local SQLite, not user input, so injection risk is low. Data-corruption risk is high.

**Verdict:** `esc()` is fine; the upstream parser (C1) is the problem.

---

## High Priority

### H1. Sync idempotency has a failure window

**File:** `scripts/sync-sqlite-to-d1.ts:105-112`

`INSERT OR REPLACE` for trades + `UPDATE sync_state` are written to a single SQL file and executed as one `wrangler d1 execute --file` call. If wrangler partially succeeds (network drop mid-file, D1 rate limit), you could have: trades inserted but `sync_state` NOT updated → next run re-inserts same rows (safe, idempotent) OR `sync_state` updated but some trades missing (bad, data loss).

**Mitigation:** wrangler likely wraps `--file` in an implicit transaction, but this is not documented and D1 remote execution has known partial-success modes for large batches. Recommend:
- Wrap explicitly: prepend `BEGIN;` and append `COMMIT;` to the SQL file
- Or split: push trades first, verify row count via follow-up query, THEN update `sync_state`

### H2. `getLastSyncedId()` silently returns 0 on parse failure

**File:** `scripts/sync-sqlite-to-d1.ts:41-48`

`catch { return 0 }` — if wrangler JSON output format changes or auth fails, this silently resyncs from id 0, re-pushing all rows. Safe (idempotent) but wasteful and hides failures. Add `console.error` in the catch and require explicit `--force-full-sync` flag to reset to 0.

### H3. Pages Function caches error payloads at 60s edge cache

**File:** `dashboard/functions/api/stats.ts:26-30, 88-93`

The `HEADERS` const with `cache-control: public, max-age=60` is applied to the `d1-error` response too. CF edge + browsers will cache a neutral zero-payload for 60 seconds even on D1 crash. KV cache is only written on success (`:82`) — that's correct. But edge cache on error is a concern.

**Fix:** For the error branch, override to `cache-control: no-store`.

---

## Medium Priority

### M1. `trades > 0` heuristic in UI fallback

**File:** `dashboard/src/components/paper-stats-card.tsx:34`

When D1 is freshly bootstrapped (zero rows), `/api/stats` returns `trades: 0` + `source: 'live-d1'`. Current code falls back to `/paper-stats.json` — which is correct behavior. But the code discards the live `source: 'live-d1'` signal. Consider: if `source === 'live-d1'` AND `trades === 0`, that's a legitimate "sync not run yet" state. Current fallback masks this. Acceptable for launch; revisit if D1 ever diverges from static long-term.

Also: the heuristic means any transient query glitch returning `trades: 0` forces a fallback. For KISS-at-launch, fine.

### M2. Pages Function `any`-ish casting to `Record<string, unknown>`

**File:** `dashboard/functions/api/stats.ts:51-55`

Four casts per row. Extract once: `const r = (res.results[0] ?? {}) as Record<string, unknown>;` and reference `r.trades`, `r.edge_avg_pct`, etc. Minor readability win.

### M3. launchd log path mismatch with code comment

**File:** `scripts/sync-sqlite-to-d1.ts:13` vs `config/launchd/sync-d1.plist:33-36`

Comment says `~/Library/Logs/algo-trader-sync-d1.log`; plist writes to `/tmp/algo-trader-sync-d1.log`. `/tmp` is cleared on reboot — logs lost. Either update comment or move plist to `~/Library/Logs/` (preferred for debuggability).

### M4. `ALGO_SQLITE` env var not propagated from launchd

**File:** `config/launchd/sync-d1.plist:38-42`

`EnvironmentVariables` dict only sets `PATH`. If user sets `ALGO_SQLITE` in `~/.zshrc`, the `source $HOME/.zshrc 2>/dev/null` in ProgramArguments *might* pick it up (launchd runs `/bin/bash -lc`). Fragile. Default `data/algo-trade.db` is relative to `cd $HOME/algo-trader`, so it works — but document the assumption.

### M5. `BATCH_LIMIT = 500` may drop rows on busy days

**File:** `scripts/sync-sqlite-to-d1.ts:23`

Nightly sync caps at 500 rows/run. If paper run produces >500 trades between 02:00 runs (e.g. 24h × 50 trades/hr), sync falls behind. Either:
- Loop until no new rows (recommended)
- Raise limit to 5000 (D1 batch insert handles this fine)
- Add monitoring: if `rows.length === BATCH_LIMIT`, log warning

---

## Low Priority

### L1. `esc(Number(id))` redundant — id is already a number
`scripts/sync-sqlite-to-d1.ts:61` — `Number.isFinite` check inside `esc()` handles it, but direct numeric emission would be clearer.

### L2. Missing TypeScript return type on `main()`, `buildInsertSql` return implicit
Minor; strict tsc already green per spec.

### L3. `paper-stats-card.tsx` `PLACEHOLDER.source = 'paper'` conflicts with API's `source: 'live-d1' | 'd1-unbound' | 'd1-error'`
No runtime impact (source isn't rendered), but type is `string` not union. Low value to tighten.

---

## Edge Cases Found by Scout

1. **Pipe char in text** — see C1. Blocker.
2. **Newline in `reasoning`** — LLM outputs often contain `\n`. `raw.split('\n')` will split mid-row. Blocker (part of C1).
3. **D1 freshly created, zero rows** — UI falls back correctly (M1), but API emits `live-d1` source with zeros. OK.
4. **KV `CACHE` unbound** — code handles via `if (env.CACHE)` guard. Good.
5. **STATS_DB unbound (dev/preview)** — returns `d1-unbound` 200. Good.
6. **D1 query timeout/crash** — returns `d1-error` 200 with message in `note`. Good, but message could leak DB schema details in production — low risk, but consider sanitizing `err.message` before returning.
7. **Concurrent sync invocations** — launchd is cron-style, so serial by default. But if user runs manually during 02:00, two sync jobs race on `sync_state`. `INSERT OR REPLACE` is idempotent so no corruption, but `last_synced_id` could regress briefly. Very low risk.
8. **`correct` field handling** — `r[15] !== ''` check (`:67`) assumes empty string means NULL. sqlite3 CLI emits empty string for NULL by default — correct. But if `correct` is literally `0`, `Number(correct)` returns `0` — intended behavior.

---

## Polar-Safe Review

Grepped all new strings for flagged vocabulary (`AI`, `health`, `wellness`, `therapeutic`, `medical`, `fitness`, `clinical`, `patient`, `diagnosis`, `treatment`):

- `'pre-resolution edge, not profit'` — neutral trading term. SAFE.
- `'D1 binding missing'`, `'live-d1'`, `'d1-error'`, `'d1-unbound'` — infra terms. SAFE.
- `'Paper Run · Snapshot'`, `'Avg pre-resolution edge'`, `'Actionable share'` — quant/trading. SAFE.
- `'Accuracy claims pending live resolution.'` — caveat language. SAFE.
- `'blind_event_only'` — strategy name. SAFE.

No Polar-flagged terms introduced. All vocabulary aligns with quant/business software positioning.

---

## Security

- D1 binding `STATS_DB` is server-side only (Pages Functions). No client exposure. ✓
- KV `CACHE` namespace id in `wrangler.toml` is a binding id, not a secret. ✓
- `database_id` UUID in `wrangler.toml` is not a secret (CF requires it to be in config). ✓
- No API keys, tokens, or credentials in any new file. ✓
- Error response exposes `err.message` to public — see Scout #6. Low-severity info disclosure. Consider: `note: 'query failed'` in prod, full message only when a debug header is present.
- `scripts/setup-d1.sh` requires `CLOUDFLARE_API_TOKEN` from env — correct, not hardcoded. ✓

---

## Positive Observations

- KISS architecture: D1 `sync_state` as source-of-truth eliminates KV coordination complexity.
- `COALESCE` + `NULLIF` in SQL handle empty-table edge case cleanly.
- UI fallback chain (live → static → error banner → placeholder) is graceful.
- `cancelled` flag in `useEffect` prevents React state update on unmount. ✓
- `functions/tsconfig.json` correctly scopes Workers types away from Vite build.
- Polar-safe copy discipline maintained throughout.
- `INSERT OR REPLACE` + PK-based sync is correct idempotent pattern.

---

## Recommended Actions (Priority Order)

1. **Fix C1 before enabling launchd cron** — switch `sqlite3` to `-json` mode, parse structured output. ~20 LOC delta.
2. **Add explicit BEGIN/COMMIT in sync SQL file (H1)** — 2 lines.
3. **Override error response cache-control to no-store (H3)** — 3 lines.
4. **Loop sync until empty or raise BATCH_LIMIT (M5)** — prevents silent backlog.
5. **Move launchd log to `~/Library/Logs/` (M3)** — debuggability.
6. **Log + fail loudly on `getLastSyncedId` parse error (H2)** — observability.
7. (Optional) sanitize error.message in Pages Function for production.

---

## Metrics

- Files: 9 (6 new, 3 modified)
- LOC: +352, -16
- TypeScript: strict, tsc green (per brief)
- Test coverage: E2E deferred per phase scope — **acceptable** given the sync script has no unit test. Recommend adding a sync-script unit test covering pipe-in-text edge case before Phase 04.
- Lint: not run in this review (reports-only)
- Polar-flagged vocabulary: 0 occurrences

---

## Unresolved Questions

1. Does `wrangler d1 execute --file` wrap execution in an implicit transaction? If yes, H1 downgrades to low. If no, the BEGIN/COMMIT fix is mandatory. (Check CF docs or test empirically.)
2. What is the expected trade volume per 24h? If <200/day, `BATCH_LIMIT=500` is fine forever. If bursting to 1000+, M5 loop is mandatory.
3. Is `~/.zshrc` sourced reliably inside the `bash -lc` shell under launchd? If user has `ALGO_SQLITE` override, does it take effect?
4. Should `/api/stats` error branch expose `err.message` to the public, or sanitize to avoid leaking D1 internals?
5. Phase 04 scope: will `paper_trades_v3` schema evolve? If so, sync script needs versioning (schema col drift will break CSV positional parse even after C1 fix).
