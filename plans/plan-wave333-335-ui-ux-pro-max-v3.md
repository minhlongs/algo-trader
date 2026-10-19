# Implementation Plan (`/ak-bootstrap` + `/ak-ui-ux-pro-max`) — Waves 333–335, Stitch Screen #14 & `<= 165 LOC` Modularization

## Phase 1: Deep LOC Refactor (`166–168 LOC → <= 165 LOC`)
- Decompose all 30 `.ts` files in `src/` at `166–168 LOC` across 3 parallel `teamwork_swe_worker` subagents so that every file in `src/` is strictly `<= 165 LOC`.

## Phase 2: UI/UX Pro Max Refactor & Stitch Screen #14 (`regime-kelly-matrix.html`)
- Extract `stitch-ui-themes.ts` and `stitch-regime-kelly-telemetry.ts` from `stitch-ui-cockpit.ts`.
- Deliver `site/public/regime-kelly-matrix.html` and `queue/regime-kelly-matrix.html`, update `SITE.md`, `stitch.json`, and `ui-ux-pro-max.js`, and expose `GET /regime-kelly` in `stitch-cockpit-routes.ts`.

## Phase 3: Quantitative Desk Waves 333–335
- Implement `Thorp2006KellyCriterion` (Wave 333), `BacryMuzy2014Hawkes` (Wave 334), and `ElEuchRosenbaum2019RoughHeston` (Wave 335).

## Phase 4: Verification & Git Commit Checkpoint
- Run `tests/unit/desk/wave_333_335_ui_ux_pro_max_v3_suite.test.ts`, `npx tsc --noEmit`, `node scripts/check-quality-baseline.mjs --quality`, and `node scripts/ci-gate-secret-scan.mjs`.
- Commit cleanly on `feat/triad-apex-deep-refactor-wave180-182`.
