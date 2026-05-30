---
title: Solo Quant Desk — A Manifesto
tagline: One human. Zero overhead. Open methodology.
license: CC-BY-4.0
domain: quant.cashclaw.cc
decisions:
  d1_domain: quant.cashclaw.cc
  d2_language: English
  d3_live_pnl_from: "$500 Phase 2"
  d4_channels: [twitter, hackernews]
  d5_license: CC-BY-4.0
date: 2026-04-16
---

# Solo Quant Desk — A Manifesto

One human runs an entire quantitative trading desk. No employees. No outside capital. Open methodology. This manifesto records what the desk is, what it refuses to become, and how the claim can be verified.

## Chapter I — The Thesis We Apply

Marc Andreessen (a16z) publicly predicted the arrival of the one-person billion-dollar company, enabled by autonomous agents taking on work previously requiring teams. Anthropic's Dario Amodei has assigned a 70–80% probability to this outcome materializing within the current decade. Proprietary trading is near the top of the list of verticals where the thesis can hold.

Empirical data points already exist. Pieter Levels operates multiple products generating more than $3M per year alone. Midjourney reached roughly $4.7M in revenue per employee at peak. The shape of the curve is not theoretical — it is being drawn.

This desk is one attempt to occupy that shape in prediction-market trading. We do not claim endorsement by a16z or Anthropic. We cite their public thesis and apply it literally.

## Chapter II — Binh Pháp, Thirteen Chapters, Mapped to Trading

Sun Tzu's Art of War maps cleanly onto the functions of a solo quant desk. Each chapter is a role usually performed by a specialist; here it is a module.

| # | Chapter | Trading Function |
|---|---|---|
| 1 | 始計 Laying Plans | Thesis research + edge discovery (outside + inside view) |
| 2 | 作戰 Waging War | Position sizing (quarter-Kelly, drawdown caps) |
| 3 | 謀攻 Attack by Stratagem | Blind-prompt alpha extraction (no market price leakage) |
| 4 | 軍形 Tactical Dispositions | Risk posture (max exposure, circuit breakers) |
| 5 | 兵勢 Energy | Compounding cadence (paper → Phase 2 → Phase 3 ramp) |
| 6 | 虛實 Weak and Strong | Identifying mispriced markets |
| 7 | 軍爭 Maneuvering | Entry/exit timing |
| 8 | 九變 Variation in Tactics | Adaptation across event vs price markets |
| 9 | 行軍 The Army on the March | Nightly operational cadence + monitoring |
| 10 | 地形 Terrain | Polymarket-specific structural edge |
| 11 | 九地 The Nine Situations | Situational plays (resolving-soon, whale-copy) |
| 12 | 火攻 Attack by Fire | Catalyst and resolution-cascade plays |
| 13 | 用間 Use of Spies | On-chain intel, whale tracking, ensemble models |

The point is not metaphor. The point is that a thirteen-chapter doctrine written for resource-constrained commanders is the right shape for a resource-constrained operator running an entire desk alone.

## Chapter III — The Zero-Overhead Stack

Every line item below has a monthly cost of zero. This is the thesis made concrete.

| Layer | Component | Monthly Cost |
|---|---|---|
| Compute | M1 Max workstation (owned) | $0 |
| Inference | DeepSeek R1 32B-4bit, local on M1 Max | $0 |
| Source DB | SQLite on M1 Max | $0 |
| Edge DB | Cloudflare D1 free tier | $0 |
| Web hosting | Cloudflare Pages | $0 |
| Worker API | Cloudflare Workers free tier | $0 |
| DNS / TLS | Cloudflare | $0 |
| Source control | GitHub | $0 |
| **Total operating overhead** | | **$0/mo** |

Capital at risk is a separate line item, allocated deliberately in Chapter IV and announced publicly when it changes.

## Chapter IV — Open Methodology

The methodology is published because a closed claim is indistinguishable from a lie.

- **Prediction model**: DeepSeek-R1-Distill-Qwen-32B-4bit, run locally, port 11435 on M1 Max.
- **Prompt strategy**: blind (no market price shown to the model at prediction time).
- **Scope**: Polymarket event markets only. Stock price, crypto price, and esports over/under markets are filtered out because prior paper data showed wrong calls in those categories.
- **Sizing**: quarter-Kelly after validation, zero before.
- **Paper run to date**: 150 trades across 3 batches. Pre-resolution average edge 14.6% — 25.3% depending on batch. Accuracy cannot be claimed until resolutions complete.
- **Live activation**: conditional on batch 2 + batch 3 resolutions clearing 55% hit rate. Initial live capital on activation: $500.
- **Source**: the repository that generated every trade is the same repository that hosts this manifesto.

## Chapter V — What We Won't Do

The shape of the desk is defined as much by its refusals as by its actions.

1. **We will not hire**. Not a co-founder, not a contractor, not a virtual assistant. The point of the thesis is that one person is enough.
2. **We will not raise outside capital before live results are validated**. A track record built on paper cannot justify anyone else's money, and borrowing credibility via a round would defeat the experiment.
3. **We will not sell signals before resolution accuracy clears 55% live**. Paper numbers are not a product.
4. **We will not describe the desk using the two-letter term for autonomous software that payment processors now flag**. Every public page is scrubbed for that term before it goes up.
5. **We will not multi-seat this**. There is no team dashboard, no permissions model, no shared workspace. The subscription, if it ever exists, is one human, one desk.
6. **We will not smooth bad weeks**. Losing batches are published in the same cadence as winning ones.

Everything else is up for revision. These six are not.

---

**Verify**: repository and live methodology at [github.com/longtho638-jpg/algo-trader](https://github.com/longtho638-jpg/algo-trader). Dashboard and rolling stats at [quant.cashclaw.cc](https://quant.cashclaw.cc). Follow-along cadence via Twitter/X (weekly) and Hacker News (monthly milestones).

© 2026 Solo Quant Desk · Licensed CC-BY 4.0 — remix allowed, attribution required.
