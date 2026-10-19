# Execution Plan (`/ak-bootstrap`): Waves 336–338, UI/UX Pro Max v4 Stitch Screen #15 & `<= 163 LOC` Deep Refactor

- **Status:** Completed
- **Branch:** `feat/triad-apex-deep-refactor-wave180-182`
- **Date:** 2026-10-18

## Workstreams

1. **Track 1 — UI/UX Pro Max v4 Refactor & Stitch Screen #15 (`hawkes-orderflow-radar.html`):**
   - Modularize `stitch-cockpit-routes.ts` (`119 LOC`) + `stitch-cockpit-schemas.ts` (`43 LOC`).
   - Modularize `ui-ux-pro-max-auditor.ts` (`59 LOC`) + `ui-ux-pro-max-rules.ts` (`88 LOC`).
   - Ship `stitch-hawkes-radar-telemetry.ts`, `site/public/hawkes-orderflow-radar.html`, and 15-screen + Bilingual `EN / VI` runtime in `site/public/assets/ui-ux-pro-max.js`.
2. **Track 2 — Quantitative Desk Triad Waves 336–338:**
   - Wave 336: `src/desk/avellanedastoikov2008/index.ts` (`AvellanedaStoikov2008Reservation`)
   - Wave 337: `src/desk/glostenmilgrom1985/index.ts` (`GlostenMilgrom1985SequentialTrade`)
   - Wave 338: `src/desk/kyle1985auction/index.ts` (`Kyle1985ContinuousAuction`)
3. **Track 3 — Deep LOC Modularization (`165 LOC → <= 163 LOC`):**
   - Parallel SWE workers (`R3-A`, `R3-B`, `R3-C`) decompose all 40 files at `164–165 LOC` in `src/` to `<= 150 LOC`.
4. **Track 4 — Verification & Git Checkpoint:**
   - Verify with `tests/unit/desk/wave_336_338_ui_ux_pro_max_v4_suite.test.ts`, `npx tsc --noEmit`, `node scripts/check-quality-baseline.mjs --quality`, and `node scripts/ci-gate-secret-scan.mjs`.
