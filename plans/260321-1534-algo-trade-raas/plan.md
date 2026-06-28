---
title: "Algo-Trade RaaS Platform"
description: "Algorithmic trading platform targeting $1M ARR via Polymarket (80%) + CEX/DEX (20%)"
status: complete
priority: P1
effort: 40h
branch: master
tags: [algo-trade, polymarket, cex, dex, raas, trading-bot]
created: 2026-03-21
---

# Algo-Trade RaaS Platform - Implementation Plan

## Goal
Build algorithmic trading platform: Polymarket 80% (win rate optimization) + CEX/DEX 20%.
Target: $1M ARR via automated strategies (arb, MM, grid, DCA, funding rate).

## Tech Stack
- **Runtime**: Bun (TypeScript)
- **CEX**: CCXT (unified exchange API)
- **DEX**: ethers.js v6 (EVM), @solana/web3.js (Solana)
- **Polymarket**: Custom TS client (CLOB API + ECDSA signing)
- **Database**: SQLite (better-sqlite3) → PostgreSQL later
- **Testing**: Vitest
- **CLI**: Commander.js

## Architecture
```
src/
├── core/           # Phase 1 (SEQUENTIAL - must complete first)
│   ├── types.ts
│   ├── config.ts
│   ├── logger.ts
│   ├── risk-manager.ts
│   └── utils.ts
├── polymarket/     # Phase 2 (PARALLEL GROUP A)
│   ├── clob-client.ts
│   ├── orderbook-stream.ts
│   ├── order-manager.ts
│   └── market-scanner.ts
├── cex/            # Phase 3 (PARALLEL GROUP A)
│   ├── exchange-client.ts
│   ├── order-executor.ts
│   └── market-data.ts
├── dex/            # Phase 4 (PARALLEL GROUP A)
│   ├── evm-client.ts
│   ├── solana-client.ts
│   └── swap-router.ts
├── strategies/     # Phase 5+6 (PARALLEL GROUP B)
│   ├── polymarket/
│   │   ├── cross-market-arb.ts
│   │   └── market-maker.ts
│   └── cex-dex/
│       ├── grid-trading.ts
│       ├── dca-bot.ts
│       └── funding-rate-arb.ts
├── data/           # Phase 7 (PARALLEL GROUP A)
│   ├── price-feed.ts
│   ├── sentiment-feed.ts
│   └── database.ts
└── cli/            # Phase 8 (PARALLEL GROUP B)
    ├── index.ts
    ├── commands/
    │   ├── start.ts
    │   ├── status.ts
    │   ├── backtest.ts
    │   └── config.ts
    └── dashboard.ts
```

## Dependency Graph

```
Phase 1 (Core) ─────────────┬──────────────────────────────────┐
       │                     │                                  │
       ▼                     ▼                                  ▼
Phase 2 (Polymarket)   Phase 3 (CEX)   Phase 4 (DEX)   Phase 7 (Data)
       │                     │               │                  │
       │                     └───────┬───────┘                  │
       ▼                             ▼                          │
Phase 5 (PM Strategies)    Phase 6 (CEX/DEX Strategies)        │
       │                             │                          │
       └─────────────┬───────────────┘──────────────────────────┘
                     ▼
              Phase 8 (CLI)
                     │
                     ▼
              Phase 9 (Tests & Integration)
```

## Execution Strategy

| Group | Phases | Mode | Estimated Effort |
|-------|--------|------|-----------------|
| **Sequential** | Phase 1 (Core) | Must complete first | 4h |
| **Parallel A** | Phase 2, 3, 4, 7 | Independent clients | 4h each (16h total) |
| **Parallel B** | Phase 5, 6, 8 | After deps complete | 4h each (12h total) |
| **Sequential** | Phase 9 (Tests) | After all phases | 8h |

## Phase Status

| Phase | Name | Status | Owner | Blocked By |
|-------|------|--------|-------|------------|
| 1 | [Core Infrastructure](./phase-01-core-infrastructure.md) | pending | - | none |
| 2 | [Polymarket Client](./phase-02-polymarket-client.md) | pending | - | Phase 1 |
| 3 | [CEX Client](./phase-03-cex-client.md) | pending | - | Phase 1 |
| 4 | [DEX Client](./phase-04-dex-client.md) | pending | - | Phase 1 |
| 5 | [Polymarket Strategies](./phase-05-polymarket-strategies.md) | pending | - | Phase 1, 2 |
| 6 | [CEX/DEX Strategies](./phase-06-cex-dex-strategies.md) | pending | - | Phase 1, 3, 4 |
| 7 | [Data Feeds & Storage](./phase-07-data-feeds-storage.md) | pending | - | Phase 1 |
| 8 | [CLI & Dashboard](./phase-08-cli-dashboard.md) | pending | - | Phase 1 |
| 9 | [Testing & Integration](./phase-09-testing-integration.md) | pending | - | All |

## File Ownership Matrix (No Overlaps)

| Phase | Exclusive Files |
|-------|----------------|
| 1 | `src/core/*`, `package.json`, `tsconfig.json`, `bunfig.toml` |
| 2 | `src/polymarket/*` |
| 3 | `src/cex/*` |
| 4 | `src/dex/*` |
| 5 | `src/strategies/polymarket/*` |
| 6 | `src/strategies/cex-dex/*` |
| 7 | `src/data/*` |
| 8 | `src/cli/*` |
| 9 | `tests/*` |

## Revenue Target Breakdown

| Strategy | Capital | Monthly Profit | Annual |
|----------|---------|---------------|--------|
| PM Arb | $50K | $8.3K | $100K |
| PM MM | $100K | $16.7K | $200K |
| PM Info Edge | $50K | $25K | $300K |
| Grid + DCA | $50K | $8.3K | $100K |
| Funding Arb | $50K | $25K | $300K |
| **Total** | **$300K** | **$83.3K** | **$1M** |

## Unresolved Questions

1. Polymarket CLOB client: rewrite py-clob-client in TS or use Python subprocess?
   - **Decision**: Rewrite core signing/order functions in TS (avoid subprocess overhead)
2. Capital allocation strategy across strategies at launch?
3. User custody model: self-serve tools first (no MSB license needed)?
4. Historical orderbook data source for Polymarket backtesting?
5. VPS deployment location (Hetzner DE vs AWS US-East)?
