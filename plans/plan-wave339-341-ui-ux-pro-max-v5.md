# Execution Plan (`/ak-bootstrap`): Waves 339–341, UI/UX Pro Max v5 Stitch Screen #16 & `<= 160 LOC` Deep Refactor

- **Status:** Completed
- **Branch:** `feat/triad-apex-deep-refactor-wave180-182`
- **Date:** 2026-10-18

## Workstreams

1. **Track 1 — UI/UX Pro Max v5 Refactor & Stitch Screen #16 (`limit-order-queue-cockpit.html`):**
   - Modularize `catalog-phases-4-to-5.ts` (`78 LOC`) + `catalog-phase-5.ts` (`64 LOC`).
   - Modularize `repository-blueprint-auditor.ts` (`89 LOC`) + `repository-blueprint-helpers.ts` (`78 LOC`).
   - Ship `stitch-queue-reactive-telemetry.ts`, `site/public/limit-order-queue-cockpit.html`, and 16-screen + live filter runtime in `site/public/assets/ui-ux-pro-max.js`.
2. **Track 2 — Quantitative Desk Triad Waves 339–341:**
   - Wave 339: `src/desk/roll1984spread/index.ts` (`Roll1984ImplicitSpread`)
   - Wave 340: `src/desk/hasbrouck1995infoshare/index.ts` (`Hasbrouck1995InfoShare`)
   - Wave 341: `src/desk/huangstoll1997threeway/index.ts` (`HuangStoll1997ThreeWay`)
3. **Track 3 — Deep LOC Modularization (`162 LOC → <= 160 LOC`):**
   - Parallel SWE workers (`R4-A`, `R4-B`, `R4-C`) decompose all 34 files at `161–162 LOC` in `src/` to `<= 148 LOC`.
4. **Track 4 — Verification & Git Checkpoint:**
   - Verify with `tests/unit/desk/wave_339_341_ui_ux_pro_max_v5_suite.test.ts`, `npx tsc --noEmit`, `node scripts/check-quality-baseline.mjs --quality`, and `node scripts/ci-gate-secret-scan.mjs`.
