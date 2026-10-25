# Evidence packet — best-of-5 advice candidates (immutable input)

Repo: `minhlongs/algo-trader` (**public**, verified via `gh repo view --json isPrivate` → false)
Worktree: `/Users/macbook/algo-trader/.claude/worktrees/feat-opencore-monetization-real`
Branch: `feat/opencore-monetization-real`, HEAD `a08e8113`
Plan: `plans/261024-1142-opencore-monetization-real/` — 9 phase files

## Confirmed reframing

**Problem (reframed):** The branch leaves 37 uncommitted paths. Four formerly-failing suites are now
green, but the open question is not "is it green" — it is whether the remaining plan phases
(5–9) should run now, and in what order, given that two of them are irreversible or outward-facing.

**Exact requirements:**
1. Decide the next action for the 37-path uncommitted diff.
2. Order and scope the remaining plan phases 5–9.
3. Surface any decision that is the user's alone (legal, financial, outward-facing).

**Goals:** Ship the open-core monetization work without either (a) blocking forever on an
unreviewable 37-file diff, or (b) publishing an irreversible legal/marketing change by accident.

**Done means** (observable):
- The user has a single next action they can hand to an executor.
- Any irreversible step is gated on explicit approval, not silently bundled.

**Non-goals:** implementing the phases; rewriting the plan; touching `src/` in this advisory pass.

**Constraints:** advisory-only (no code edits); KISS/DRY; no `--yagni`.

## Verified evidence (command-checked in this session)

Test/type state of the working tree at time of advice:
- Full suite: 1365 files passed | 1 skipped; **17295 tests passed, 0 failed**
- `npx tsc --noEmit` → exit 0
- eslint on touched files → 0 errors (files outside the `lint` script's `src` scope)

Plan phase completion:
- Phases 1–4 have `## Status` blocks (3 and 4 explicitly verified).
- Phases 5, 6, 7, 8, 9 have **no** Status block → not done.

Phase 5 (leaderboard) — verified:
- `docs/backtest-leaderboard.md` still advertises false numbers; confirmed hits:
  line 21 `Cross-DEX Arbitrage V2 | SOL/USDT, ETH/USDT | 3.82 | -2.4% | 88.5% | +64.2% | ENTERPRISE`
  line 23 `Funding Rate Carry Arbitrage | BTC/USDT Perp | 2.95 | -1.8% | 94.2% | +28.5% | PREMIUM`
- `reports/backtest-results.csv` = 31 lines (30 data rows); only **6 of 30** rows have trades > 0.
- `src/platform/api/routes/leaderboard-builder.ts` already exists and already handles
  Infinity/isFinite (2 guard occurrences) → phase 5 is hookup, not a new parser.

Phase 7 (license relabel) — verified:
- `COMMERCIAL-LICENSE.md` absent.
- `license-gate.ts:1` and `billing-meter.ts:1` still carry `SPDX-License-Identifier: MIT`.
- Repo is public → MIT grant already distributed; relabel is forward-only and cannot claw back.
- `CONTRIBUTING.md` reportedly lists `src/trading/`, which does not exist (plan claim, not re-verified).

Phase 8 (both channels → one entitlement) — partially verified:
- Webhook routes by `order_id` prefix (`sig_` / `mp_` / else → platform), line 74-75.
- Marketplace rail exists: `subscription-subscribe-handler.ts:50` calls
  `createMarketplaceCheckoutUrl`; implemented in `src/platform/billing/nowpayments-marketplace.ts:11`.
- NOT verified: whether tier is read from `PRICING_TIERS` or trusted from the client payload, and
  whether payment idempotency is durable (phase-8's two named money risks).

Working tree:
- 37 changed paths, uncommitted. Deletions include `src/billing/billing-meter.ts`,
  `src/platform/billing/usage-metering.ts`, and the five shadow meters.
- Two pre-existing stashes untouched: `phase4-changelog-check`, `phase4-tier-boundary-check`.

## What the user has already decided (do not revisit)

- For the dead Redis meter facade: **rewire the tests to the surviving pure functions** rather than
  restoring the facade or deleting 21 tests. (Chosen via AskUserQuestion earlier.)
