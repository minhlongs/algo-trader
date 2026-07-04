---
title: "Brainstorm: AI Co-pilot + GTM for Algo-Trader Next Wave"
created: "2026-07-04T00:23:00.000Z"
status: approved
---

# AI Co-pilot + GTM — Next Wave IV

## Vision
Natural language AI trading assistant trên dashboard web và Telegram. User hỏi "what's my risk?" → nhận câu trả lời real-time + action buttons.

## Architecture

```
User → POST /api/v1/co-pilot/ask
  → Intent Classifier (5 predefined intents or fallback LLM)
  → Handler gathers data from existing services
  → Response: { answer, actions[], sourceData? }
```

## 5 Intent Handlers

| Intent | Trigger | Data Sources |
|--------|---------|-------------|
| risk_assessment | "what's my risk?" | KellyPositionSizer, DrawdownMonitor, CircuitBreaker |
| arb_scan | "find arb opportunities" | SpreadDetector, CrossMarketArb, GammaClient |
| strategy_performance | "how are my strategies?" | PredictionAccuracyTracker, BacktestRunner |
| market_regime | "what's the market doing?" | RegimeDetector, SignalFusionEngine |
| weekly_report | "generate report" | TradeHistory, P&L, AccuracyTracker |

## Files

```
NEW files:
├── src/platform/api/routes/co-pilot-routes.ts
├── src/platform/intelligence/co-pilot/
│   ├── intent-classifier.ts
│   ├── handlers/
│   │   ├── risk-handler.ts
│   │   ├── arb-handler.ts
│   │   ├── performance-handler.ts
│   │   ├── regime-handler.ts
│   │   └── report-handler.ts
│   └── response-formatter.ts
├── dashboard/src/components/co-pilot/
│   ├── co-pilot-chat.tsx
│   ├── co-pilot-fab.tsx
│   ├── co-pilot-message.tsx
│   └── co-pilot-actions.tsx
└── src/platform/telegram/ask-handler.ts
```

## Execution Order (Xen kẽ)

```
Day 1-3:   Backend Co-pilot (intent classifier + 5 handlers + endpoint)
Day 4-5:   GTM email campaign to FREE users
Day 6-8:   Dashboard chat widget (FAB + panel + messages + actions)
Day 9-10:  Telegram /ask command + launch content (Reddit, Twitter, Discord, Blog)
```

## Success Metrics
- [ ] 5 intent handlers respond correctly with live data
- [ ] Fallback LLM chat works for unrecognized queries
- [ ] Dashboard chat widget renders + typing indicator + action buttons
- [ ] Telegram /ask responds within 5 seconds
- [ ] Email campaign sent to all FREE users
- [ ] Launch content on 2+ channels (Reddit, Twitter, Discord, Blog)
- [ ] 2,855+ tests passing, 0 regressions
