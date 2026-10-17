# Brainstorming & Trade-Off Report: Waves 323–326 Stitch 8-Screen Cockpit, E2E Monetization & Deep 183-LOC Refactor (`--deep`)

- **Date:** 2026-10-17
- **Workflow:** `/ak-brainstorm --deep` → `/ak-bootstrap` → `/teamwork-preview` (`cả 4`)
- **Project:** `/Users/macbook/algo-trader`

## 1. Opening Brainstorm Contract

- **Outcome:**
  1. Decompose all 10 `185 LOC` files and all 11 `184 LOC` files in `src/` into cohesive single-responsibility submodules (`<= 170 LOC`) so zero `.ts` files in `src/` exceed `183 LOC`.
  2. Deliver Quantitative Desk Triad Waves 323–325 (`AlmgrenChriss2001Risk`, `Cartea2018SignalDecay`, `Bouchaud2018TradesBook`) with zero-mock analytical tests (`tests/unit/desk/waves_323_325_suite.test.ts`).
  3. Implement the Stitch 8-Screen UI Cockpit Engine (`stitch-ui-cockpit.ts`) and Express API Router (`stitch-cockpit-routes.ts`) wired to `LicenseGate`, `BillingMeter`, `StrategyMarketplace` (70/30 revshare), `ComplianceAuditLogger` (SHA-256 chain), and `UnifiedIpnWebhookHandler` (PayOS + NOWPayments, Polar blocked).
  4. Verify E2E Monetization, Kill-Switch, and CLI (`wave_326_stitch_cockpit_e2e.test.ts`) and create a clean conventional commit on the feature branch.
- **Constraints:**
  - `AGENTS.md` 11 Hard Rules: `0 :any` types, `0` new `console.*` calls, `0` secret leaks, `0` TypeScript errors, 100% backward compatibility on all public exports.
- **Non-Goals:**
  - Breaking external API contracts or altering D1 database schemas.
