# Audit Snapshot

**Date:** 2026-05-21 14:00 (Vietnam)
**Repo HEAD:** `f344fc95398310829382bd8a80b07ab4f5dc2a12`
**Branch:** `master` (no `main` configured locally)
**Working tree:** clean except untracked:
- `.wrangler/cache/`
- `plans/260521-1400-codebase-audit/`

**Method:** Read-only investigation. 7 parallel subagent explorations covering repo map, trading pipeline, intelligence/signal/ML, RaaS/billing/auth, infra/deploy, feeds/integrations, and frontend. No code or `docs/` changes.

**Package:** `@mekong/algo-trader` v1.1.0 (per `package.json`).

**Bins:**
- `algo-trader` → `dist/cli/index.js`
- `cashclaw` → `dist/cli/cashclaw-cli.js`

**File counts at HEAD:**
- 376 TypeScript files under `src/`
- 41 modules under `src/`
- 75+ doc files under `docs/` (treated as input hypothesis only)
