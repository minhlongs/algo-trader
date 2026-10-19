---
title: "Waves 323-326 Stitch 8-Screen UI Cockpit, E2E Monetization & 183-LOC Deep Refactor"
status: completed
updated: 2026-10-17
workflow: "/ak-bootstrap -> /ak-brainstorm --deep -> /teamwork-preview"
---

# Plan: Waves 323–326 Stitch Cockpit, E2E Monetization & Deep 183-LOC Refactor

## 1. Parallel Tracks
- **Track 1 (R1-A):** Decompose all 10 files at `185 LOC` in `src/` down to `<= 170 LOC`.
- **Track 2 (R1-B):** Decompose all 11 files at `184 LOC` in `src/` down to `<= 170 LOC`.
- **Track 3 (R2 & R3):** Quantitative Desk Triad Waves 323–325 + Stitch 8-Screen UI Cockpit (`stitch-ui-cockpit.ts`, `stitch-cockpit-routes.ts`) + E2E Verification Suite (`wave_326_stitch_cockpit_e2e.test.ts`).
- **Track 4 (R4):** Full CI Gate verification (`tsc`, quality ratchet, secret scan, Vitest) & feature-branch commit.
