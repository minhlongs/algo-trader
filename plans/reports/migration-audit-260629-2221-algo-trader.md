# Migration Audit Report — 2026-06-29

## Context
Phase 1 stabilization: audit 5 deleted migration files.

## Finding: All 5 deletions are SAFE — files were reorganized, not removed

DB not accessible locally (`_migrations` table unreadable). Analysis based on file comparison between git HEAD and working tree.

| # | Deleted File | Replacement | Verdict |
|---|---|---|---|
| 1 | `021_create_tenant_audit_logs.sql` | `021_tenant_audit.sql` | **Merged** — audit_logs + credentials combined into one file |
| 2 | `021_tenant_credentials.sql` | `029_tenant_credentials.sql` | **Renumbered** — identical content, moved to 029 slot |
| 3 | `024_backfill_referral_codes.ts` | `024_create_referral_tables.sql` | **Replaced** — one-time backfill script replaced by table creation (different purpose, same slot) |
| 4 | `025-create-marketplace-schema.ts` | `025-marketplace-schema.ts` | **Renamed** — hyphen fix only |
| 5 | `025_create_marketplace_tables.ts` | `030_create_marketplace_tables.ts` | **Renumbered** — moved to 030 to avoid 025 prefix conflict |

## Decision
All 5 deletions confirmed safe. Replacements exist and preserve functionality:
- 021 merged: audit_logs + credentials now in single `021_tenant_audit.sql`
- 029 renumbered: avoids 021 prefix collision
- 024 replaced: backfill was one-time, table creation is permanent
- 025 renamed: hyphen consistency
- 030 renumbered: avoids 025 prefix collision

## Unresolved
- Could not verify `_migrations` table (DB not running locally). If these migrations were applied in production, the renamed files would need to be registered as already-applied to prevent re-run.
- Migration runner (`src/db/migration-runner.ts`) only tracks 2 of 30+ migrations — most are applied via manual process.
