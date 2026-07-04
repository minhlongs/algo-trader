# Brainstorm: Weeks 3-4 — Platform Growth + Dashboard UX + Strategy Analytics

**Date:** 2026-07-02 16:07 | **Mode:** --deep --parallel
**Status:** design complete

## Context

Go Live Tuần 1 (deploy + launch + IPN + live trading) và Monitoring Tuần 2 (Grafana + Prometheus + Alertmanager) đã hoàn thành hoặc đang chờ user action. Giờ focus vào growth: đưa platform từ "chạy được" thành "có customers kiếm tiền."

## Sub-Projects Decomposition

### Track A: Platform Growth

| # | Sub-Project | Effort | Deps | Files |
|---|-------------|--------|------|-------|
| A1 | Marketplace listings — thêm 5+ strategies | ~3h | — | desk-strategy-seeder.ts, marketplace-execution-bridge.ts |
| A2 | Referral program go-live | ~2h | — | referral-routes.ts (built), dashboard referral page (built) |
| A3 | Telegram marketplace commands | ~3h | — | bot-command-handlers.ts (modify) |
| A4 | Blog + newsletter go-live | ~1h | — | Routes built, content needed |

**A2-A4 có thể chạy song song. A1 độc lập.**

### Track B: Dashboard UX

| # | Sub-Project | Effort | Deps | Files |
|---|-------------|--------|------|-------|
| B1 | Marketplace payment/subscribe UX | ~4h | — | marketplace-page.tsx, use-marketplace.ts |
| B2 | Live trading status in dashboard | ~3h | — | New dashboard page/component + API route |
| B3 | Strategy detail page with backtest charts | ~3h | A1 | marketplace-page.tsx, backtest-results.tsx |
| B4 | Subscriber equity/trade history polish | ~2h | — | subscriber-equity.tsx, subscriber-trade-history.tsx |

### Track C: Strategy Analytics

| # | Sub-Project | Effort | Deps | Files |
|---|-------------|--------|------|-------|
| C1 | Systematic backtest ALL strategies | ~4h | — | CLI: algo trade backtest --strategy=all |
| C2 | Performance comparison report | ~2h | C1 | Python/TS script + report |
| C3 | Surface top performers in marketplace | ~2h | C2 | marketplace-page.tsx |

## Recommended Sequence

```
Week 3:
  Mon-Tue: A1 (marketplace listings) + B1 (payment UX) — parallel
  Wed:     A2 (referral) + A3 (Telegram commands) — parallel
  Thu:     C1 (systematic backtest) — CSV output
  Fri:     C2 (performance report) + C3 (top performers)

Week 4:
  Mon:     B2 (live trading dashboard) + B3 (strategy detail page)
  Tue:     B4 (equity/trade history polish) + A4 (blog/newsletter)
  Wed:     Polish + test + deploy
```

## Files to Touch

| File | Action | Track |
|------|--------|-------|
| `src/platform/marketplace/services/desk-strategy-seeder.ts` | MODIFY — add 5 non-V2 strategies | A1 |
| `src/platform/marketplace/services/marketplace-execution-bridge.ts` | MODIFY — adapters for new strategies | A1 |
| `src/platform/telegram/bot-command-handlers.ts` | MODIFY — add /campaign, /results | A3 |
| `dashboard/src/pages/marketplace-page.tsx` | MODIFY — payment UX, backtest display | B1, B3 |
| `dashboard/src/components/backtest-results.tsx` | MODIFY — richer charts | B3 |
| `dashboard/src/pages/subscriber-equity.tsx` | MODIFY — polish | B4 |
| `dashboard/src/pages/subscriber-trade-history.tsx` | MODIFY — polish | B4 |
| New: dashboard live-trading page | CREATE | B2 |
| New: performance report | CREATE | C2 |

## Out of Scope

- Mobile app
- Multi-language support
- New strategy development (chỉ listing existing)
- CEX/DEX integration
- Kubernetes scaling

## Next

Hand off to `/ck:plan` for detailed phases.
