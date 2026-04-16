---
name: Chính Danh a16z — Dual-Layer Positioning for algo-trade
date: 2026-04-16
slug: chinh-danh-a16z-dual-layer
project: algo-trader
mode: auto
status: in_progress
sources:
  - /Users/macbookprom1/plans/reports/brainstorm-260416-1213-algo-trade-chinh-danh-a16z.md
shipped:
  - PR #100 commit e5b0208 — Phases 01/02/04 shipped to main
  - CF Pages URL: https://1bad493e.algo-trader-dashboard.pages.dev
  - Verification: HTTP 200 on /, /manifesto, /methodology, /manifesto.md
  - CI status: Lint + Build green
---

# Chính Danh a16z — Dual-Layer Positioning

## Context
- Brainstorm: `/Users/macbookprom1/plans/reports/brainstorm-260416-1213-algo-trade-chinh-danh-a16z.md`
- Doctrine: `~/.claude/projects/-Users-macbookprom1/memory/feedback_a16z_solo_company_doctrine.md`
- Strategy: `docs/BINH_PHAP_TRADING.md` (exists)
- Dashboard: `dashboard/` (React + Vite + Tailwind, CF Pages ready)
- Edge: `wrangler.toml` + Worker at `src/workers/edge-proxy.ts`, KV `CACHE` already bound
- Data: `data/algo-trade.db` (paper trades SQLite on M1 Max)

## Objective
Dual-layer positioning cho algo-trade:
- **Trang chủ `/`** — Solo Quant Desk on Polymarket, numbers-first, community audience
- **`/manifesto`** — a16z + Binh Pháp doctrine, Ch. I-V, VC/solopreneur audience

Chính danh = honesty (what we WON'T do) + zero-overhead proof + a16z cite đúng nguồn + community-verifiable numbers.

## Constraints (MANDATORY)
1. Zero overhead $0/mo — M1 Max + CF Pages + D1 free tier + local LLM
2. Solo-only forever — no team features, no multi-seat
3. Track record chưa validate — NO "profitable" claim until Phase 2 live ≥55% accuracy
4. Polar-safe wording — scrub "AI/wellness/health"; use "solo quant desk", "autonomous agent"
5. Vercel BANNED (2026-03-27) — CF Pages only
6. Audience priority: Polymarket community → indie hackers → VC

## Phases

| # | Phase | Priority | Status |
|---|---|---|---|
| 01 | Decisions gate + `docs/manifesto.md` | P0 | completed |
| 02 | Dashboard landing `/` + `/manifesto` route | P0 | completed |
| 03 | Live dashboard D1 + Worker sync | P1 | pending |
| 04 | Polymarket profile + build-in-public cadence | P1 | partial |

## Dependencies
- Phase 02 blocked by Phase 01 (manifesto content needed)
- Phase 03 blocked by Phase 02 (dashboard routes needed for data display)
- Phase 04 can run parallel with Phase 03 (social presence independent)

## Unresolved (expose in Phase 01 for user decision)
1. Domain binding: `algo-trade.xyz` (register new) vs sub-domain của cashclaw.cc / agencyos.network
2. Manifesto ngôn ngữ: Eng-only / VN-only / song ngữ
3. Live P&L timing: show từ $500 Phase 2 hay đợi $5K
4. Build-in-public channel chính: Twitter/X vs HackerNews vs cả hai
5. Manifesto license: CC0 vs CC-BY

## Success Metrics
- 30d: manifesto + landing live, 150 paper trades rendered, ≥3 public posts, 0 Polar-unsafe copy
- 90d: Phase 2 live $500 funded (if batch 2+3 ≥55%), ≥1 influential cite, ≥500 manifesto views
- Long-term: community acknowledge, VC outbound, revenue > $0

## Risk Assessment
See brainstorm report §5. Top risks: a16z namedrop perception, poor Phase 2 numbers, Polymarket VN-flavor rejection. Mitigations codified in phase files.

## Next
Start with Phase 01 (decisions gate). All 5 unresolved must be answered before manifesto content is finalized.
