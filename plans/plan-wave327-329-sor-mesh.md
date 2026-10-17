# Implementation Plan (`/ak-bootstrap`) — Waves 327–329 Multi-Venue SOR Triad, Stitch Screen #13 & `<= 180 LOC` Modularization

## Phase 1: Deep LOC Refactor (`181–183 LOC` → `<= 180 LOC`)
- Decompose all 33 remaining `.ts` files in `src/` (`181–183 LOC`) across 3 parallel `teamwork_swe_worker` subagents so that every file in `src/` is strictly `<= 180 LOC`.
- Preserve 100% backward-compatible exports across all refactored facades.

## Phase 2: Quantitative Desk Waves 327–329
- **Wave 327:** `src/desk/contkukanov2017multiexchange/` (`ContKukanov2017MultiExchange`)
- **Wave 328:** `src/desk/laruellelehalle2013darkpool/` (`LaruelleLehalle2013DarkPoolSplit`)
- **Wave 329:** `src/desk/foucault2005maketake/` (`FoucaultKadanKandel2005MakeTake`)
- Export via `src/desk/barrels/quant-models-waves-274-316-barrel.ts` (`60 LOC < 85 LOC`).

## Phase 3: Stitch Screen #13 (`order-routing-mesh.html`) & API Wiring
- Create `site/public/order-routing-mesh.html` and `queue/order-routing-mesh.html` implementing all 4 panels from `next-prompt.md`.
- Register Screen #13 in `SITE.md` and `stitch.json`.
- Create `src/desk/opencoresaas2026monetization/stitch-sor-mesh-telemetry.ts` and expose `GET /sor-mesh` in `src/platform/api/routes/stitch-cockpit-routes.ts`.

## Phase 4: Verification & Git Commit Checkpoint
- Run `tests/unit/desk/waves_327_329_sor_mesh_suite.test.ts`, `npx tsc --noEmit`, `node scripts/check-quality-baseline.mjs --quality`, and `node scripts/ci-gate-secret-scan.mjs`.
- Commit cleanly on `feat/triad-apex-deep-refactor-wave180-182`.
