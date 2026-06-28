> **Plan Status:** COMPLETED — Paper trading live on M1 Max since 2026-04-11

---
status: complete
---
# Paper Trading Go-Live + Kalshi Cross-Platform

## Goal
Wire bot end-to-end for paper trading + add Kalshi read-only price feed. Prove positive edge in 30 days.

## Status
| Phase | Description | Status | Group |
|-------|-------------|--------|-------|
| 22 | Wire NATS → Strategy → Paper Execution (end-to-end) | pending | A |
| 23 | Kalshi Public API Price Feed | pending | A (parallel) |
| 24 | Cross-Platform Arb Detector (Polymarket vs Kalshi) | pending | B (after 23) |
| 25 | Paper Trading P&L Tracker + Grafana | pending | B (after 22) |

## Dependency Graph
```
Phase 22 (Wire E2E) ──► Phase 25 (P&L Tracker)
Phase 23 (Kalshi Feed) ──► Phase 24 (Cross-Platform Arb)
```

## Execution
Group A: Phases 22 + 23 parallel
Group B: Phases 24 + 25 parallel (after A)

## File Ownership
| Phase | Owns |
|-------|------|
| 22 | src/wiring/paper-trading-orchestrator.ts |
| 23 | src/feeds/kalshi-price-feed.ts |
| 24 | src/arbitrage/cross-platform-arb-detector.ts |
| 25 | src/dashboard/paper-trading-pnl-tracker.ts |

## Success Metrics
- Paper P&L > 0 after 30 days
- Win rate > 55%
- Avg edge > 2.5%
- False positive rate < 30%
