# Dead Code Audit — Phase 4

**Date:** 2026-06-30 23:31
**Type:** audit
**Status:** complete — zero deletions (nothing dead to remove)

---

## 1. citadel/ — SAFE (nothing to delete)

**Checked:** `src/desk/citadel/` does not exist. No citadel directory anywhere in `src/`.

**Import grep:** zero TypeScript imports of citadel from any module (excluding tests).

**Remaining references:**
- `dist/desk/citadel/` — stale build artifact only, handled by `pnpm build:clean`
- `src/platform/raas/subscriber-executor.ts:91` — code comment: `"Phase 01 citadel would sign this with BYOK key."`
- `src/shared/db/migrations/010_citadel_attestations.sql` — DB migration (keeps schema history, not dead code)
- CLAUDE.md lists `citadel/` under desk but the directory never existed in source; docs reference stale.

**Verdict:** Nothing to delete.

---

## 2. Duplicate Migrations — CLEAN (no duplicates)

**Checked:** All 22 migration files in `src/shared/db/migrations/`.

| Prefix | File |
|--------|------|
| 001 | `001-create-trades-table.ts` |
| 004 | `004_better_auth_tables.sql` |
| 010 | `010_citadel_attestations.sql` |
| 011 | `011_sandbox_invocations.sql` |
| 012 | `012_ironclaw_audit.sql` |
| 014 | `014_signal_feed.sql` |
| 015 | `015_subscriber_attribution.sql` |
| 016 | `016_qwen_paper_tracking.sql` |
| 017 | `017_strategy_review_tasks.sql` |
| 018 | `018_qwen_signals_loop_runs.sql` |
| 019 | `019_add_trades_composite_index.ts` |
| 020 | `020_db_performance_optimizations.ts` |
| 021 | `021_tenant_audit.sql` |
| 022 | `022_dna_journal.sql` |
| 023 | `023_dna_engine_state.sql` |
| 024 | `024_create_referral_tables.sql` |
| 025 | `025-marketplace-schema.ts` |
| 026 | `026-create-ai-audit-tables.ts` |
| 027 | `027-usage-metering-schema.sql` |
| 028 | `028_tenant_audit_logs.sql` |
| 029 | `029_tenant_credentials.sql` |
| 030 | `030_create_marketplace_tables.ts` |

**Git history verified:** 021 and 025 each have unique history; no stale duplicates.

**Verdict:** Zero duplicate prefixes. Nothing to delete.

---

## 3. Unused Exports — CLEAN (all top-level files are entry points)

**Top-level src/ files (not in desk/platform/shared):**

| File | Exports | Consumers |
|------|---------|-----------|
| `src/index.ts` | `main()`, `version`, `GruStrategyOptions`, `ArbAutoOptions` | `package.json` scripts (`pnpm dev`, `pnpm setup`, etc.) |
| `src/app.ts` | `startApp()`, `stopApp()` | Direct execution via `require.main === module`, imported by tests |
| `src/index.test.ts` | (tests only) | Vitest |

**Verdict:** No unused top-level modules. All three are purpose-built entry points.

---

## 4. Old Import Paths — CLEAN (no dangling references)

**Grep for deleted directories:** `src/wiring/`, `src/accounting/`, `src/analytics/`, `src/assignment/`, `src/exchanges/`, `src/testing/`, `src/ui/`

| Directory | Status |
|-----------|--------|
| `src/wiring/` | Zero imports found |
| `src/accounting/` | Zero imports found |
| `src/analytics/` | Zero imports found |
| `src/assignment/` | Zero imports found |
| `src/exchanges/` | Zero imports found |
| `src/testing/` | Zero imports found |
| `src/ui/` | Two **comment-only** references in `landing-server.ts:85` and `dashboard-server.ts:107`. Directory actively used at runtime for static asset serving (CSS/JS via `UI_DIR` path resolution). **NOT dead code.** |

**Verdict:** Zero dangling imports to deleted directories.

---

## 5. Typecheck

Baseline typecheck shows 1 pre-existing error (not caused by this audit):

```
src/desk/execution/paper-position-tracker.ts:211:12 — error TS2322
Type 'PaperAccount | undefined' is not assignable to type 'PaperAccount | null'.
```

Root cause: `readJsonState<T>()` in `src/shared/persistence/file-store.ts:64` returns `T | undefined`, but the caller in `paper-position-tracker.ts:205` declares return type as `{ account: PaperAccount | null }`. Needs `?? null` fallback or return type change to `PaperAccount | undefined`.

This is outside audit scope but blocks clean typecheck.

---

## 6. Additional Notes (not deletions, but need investigation)

### 6.1 dashboard/ imports from non-existent modules
`src/platform/dashboard/dashboard-server.ts` imports:
- `../../admin/admin-analytics.js` — file does not exist anywhere in src/
- `../../openclaw/ai-signal-generator.js` — not verified (likely missing)
- `../../openclaw/trade-observer.js` — not verified (likely missing)
- `../../copy-trading/leader-board.js` — not verified (likely missing)
- `../core/logger.js` — not verified (likely missing)
- `../../users/user-store.js` — not verified (likely missing)

**Mitigation:** dashboard/ is excluded from tsconfig (`src/platform/dashboard/**/*`), so these broken imports don't fail typecheck. But the files are dead at runtime.

### 6.2 desk/wiring/ excluded from tsconfig but imported by platform/
`src/desk/wiring/**/*` is in tsconfig exclude, yet imported by:
- `src/platform/telegram/trading-alerts.ts`
- `src/platform/api/routes/admin-qwen-routes.ts`
- `src/platform/api/routes/health.ts`

TypeScript resolves these because excluded files are still compiled when imported by included files. The exclusion only prevents direct compilation as roots. Consider removing `desk/wiring` from exclude if it's actively used.

### 6.3 CLAUDE.md stale references
- Lists `citadel/` as existing under desk — directory never existed in source
- Lists `ironclaw/` with active imports confirmed (used by `platform/audit/`)

---

## Summary

| Check | Result |
|-------|--------|
| citadel/ dead code | Nothing to delete — dir doesn't exist |
| Duplicate migrations | Zero duplicates |
| Unused top-level exports | Zero — all are entry points |
| Old import paths | Zero dangling imports |
| Deletions performed | 0 |
| Typecheck after audit | 1 pre-existing error (unrelated) |
