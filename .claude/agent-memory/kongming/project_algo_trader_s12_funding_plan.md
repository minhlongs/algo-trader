---
name: s12-funding-rate-acceptance-plan
description: S12 run 2 plan written 2026-08-26 — P32 unblock via fapi.binance.com fundingRate (verified reachable), derived-bps CandleLike representation locked, robustness handler spread-fold bug found
metadata:
  type: project
---

S12 (MASTER COMMAND run 2) planned at `.orchestrate/latest/plan.md` on 2026-08-26.

Key verified facts:
- `https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=N` (no auth) returned live JSON from local machine — geo-block risk LOW locally.
- Robustness handler bug discovered during planning: `src/desk/cli/alpha-robustness-handler.ts` builds stress cost WITHOUT folding spread into fee (ignores `applyStressToBaselineConfig`), so applied EXTREME ≈55bps vs advertised ~100bps round-trip.
- Locked design decision: funding E2E tests the funding-RATE series as a bps-scaled CandleLike[] (close = rate×10⁴, causal open=prev-close), tp/sl from empirical percentiles — NOT directional perp-price strategy (experiment engine has no signal-gated entry; adding one = forbidden refactor). Limitation documented in run card + docs.
- Honest fallback: if real funding data unobtainable → record BLOCKED verbatim, never fake data.

**Why:** closes last gap to PHASE 32 verbatim + 4 S11 escrow LOWs.
**How to apply:** next session should execute plan steps 0–7 in order; do not relitigate §1 representation decision without new evidence. See [[project-algo-trader-ship-pipeline]] for deploy doctrine.
