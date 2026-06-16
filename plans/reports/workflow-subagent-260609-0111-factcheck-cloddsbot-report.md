# Fact-Check: "CloddsBot: Bot với 118+ strategies — repo exists and is actively maintained"

## Verdict: PARTIALLY TRUE (repo exists + maintained) / FALSE (118+ strategies)

---

## Claim Breakdown

| Sub-claim | Result | Evidence |
|-----------|--------|----------|
| Repo exists | **TRUE** | `alsk1992/CloddsBot` — HTTP 200 via GitHub API |
| Actively maintained | **TRUE** | Last push 2026-05-22, last update 2026-06-08, not archived, 337 stars, 72 forks |
| 118+ strategies | **FALSE** | Actual count: ~4-6 strategies |

---

## Repo Facts (from GitHub API)

- **Full name**: `alsk1992/CloddsBot`
- **Description**: "Open Source AI trading agent that operates autonomously across 1000+ markets — Polymarket, Kalshi, Binance, Hyperliquid, Solana DEXs, 5 EVM chains."
- **Language**: TypeScript
- **Stars**: 337 | **Forks**: 72
- **Created**: 2026-01-26 | **Last push**: 2026-05-22 | **Last update**: 2026-06-08
- **Archived**: No | **Disabled**: No | **Size**: 14.8 MB
- **Open issues**: 12

---

## Strategy Count — Actual Evidence

### Strategy directories (from recursive tree — 1101 total files):
1. `src/strategies/crypto-hft/` — 6 files (index, market-scanner, orderbook, positions, presets, **strategies.ts**)
2. `src/strategies/hft-divergence/` — 5 files (detector, index, market-rotator, position-manager, strategy, types)

### strategies.ts header (verbatim from raw GitHub):
```
/** * 4 Strategies for 15-minute Polymarket Crypto Markets * * Each strategy: * - Uses real orderbook data (OBI, spread, depth) * * 1. Momentum — Spot moved, poly lagging → maker_then_taker entry * 2. Reversion — Poly overshot on noise → maker entry (patient, cheap) * 3. Penny Clip — Oscillating in zone, buy dips → maker entry (V4 from firstorder) * 4. Expiry Fade — Near expiry, no trend → taker entry (speed, last chance) */
```

**Actual strategy count: 4 in crypto-hft + divergence strategy in hft-divergence = ~5 strategies.**

The "118+ strategies" number does not appear anywhere in the repo. It was likely AI-hallucinated metadata.

---

## Where the False Claim Originated

The claim was embedded in a workflow script:
`/Users/macbook/.claude/projects/-Users-macbook-algo-trader/90b1c149-bfef-46e3-b512-98e1d0da0cbb/workflows/scripts/deep-research-prediction-markets-wf_929d9a6f-27b.js`

```javascript
{ id: 6, name: 'CloddsBot', url: 'https://github.com/alsk1992/CloddsBot', desc: 'Bot với 118+ strategies' },
claim: 'CloddsBot implements 118+ distinct trading strategies',
source: 'https://github.com/alsk1992/CloddsBot',
```

This was research source #6 in a deep-research workflow. The "118+ strategies" description and claim were fabricated by a previous AI session and never verified against the actual repo.

---

## Contradicting Evidence Summary

1. **strategies.ts** explicitly documents "4 Strategies" with named list: Momentum, Reversion, Penny Clip, Expiry Fade
2. **Only 2 strategy directories** exist in the entire codebase (crypto-hft, hft-divergence)
3. **24 strategy-related files** total — consistent with ~5 strategies, not 118+
4. **Repo description** talks about "1000+ markets" (coverage), NOT strategy count — the "118" may be a confusion between markets and strategies
5. **No file or config** references 118 strategies anywhere in the tree

---

## Unresolved Questions

- What is the actual total strategy count including all variants/parameter combinations? (Could be higher than 5 if presets.ts defines variants)
- The "1000+ markets" in the repo description — is this accurate or also inflated?
