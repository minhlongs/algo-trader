# Implementation Plan (`/ak-bootstrap` + `/ak-ui-ux-pro-max`) — Waves 330–332, UI/UX Pro Max Auditor & `<= 168 LOC` Modularization

## Phase 1: UI/UX Pro Max Shared Assets & 13-Screen Hardening
- Deliver `site/public/assets/ui-ux-pro-max.css` and `site/public/assets/ui-ux-pro-max.js`.
- Inject into all `site/public/*.html` screens with skip links, `aria-live="polite"`, `:focus-visible`, `prefers-reduced-motion`, `Cmd+K` Command Palette, 3-theme switcher, and double-confirmation Kill-Switch.

## Phase 2: Programmatic UI/UX Pro Max Auditor (`ui-ux-pro-max-auditor.ts`)
- Implement `UiUxProMaxAuditor` in `src/desk/opencoresaas2026monetization/ui-ux-pro-max-auditor.ts` and expose `GET /ui-ux-audit` in `src/platform/api/routes/stitch-cockpit-routes.ts`.

## Phase 3: Deep LOC Refactor (`169–170 LOC → <= 168 LOC`) & Waves 330–332
- Decompose all 28 `.ts` files in `src/` at `169–170 LOC` across 2 parallel `teamwork_swe_worker` subagents.
- Implement Waves 330–332 (`Gatheral2006SviSurface`, `AndersenBollerslev1998IntradayVol`, `EasleyLopezDePrado2012VpinToxicity`).

## Phase 4: Verification & Git Commit Checkpoint
- Run `tests/unit/desk/wave_330_332_ui_ux_pro_max_suite.test.ts`, `npx tsc --noEmit`, `node scripts/check-quality-baseline.mjs --quality`, and `node scripts/ci-gate-secret-scan.mjs`.
- Commit cleanly on `feat/triad-apex-deep-refactor-wave180-182`.
