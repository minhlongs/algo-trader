---
phase: 1
title: "Backend Co-pilot Core"
status: pending
effort: "M (3-4 days)"
---

# Phase 1: Backend Co-pilot Core

## Overview

Build the backend AI Co-pilot: intent classifier, 5 intent handlers, fallback LLM, and POST /api/v1/co-pilot/ask endpoint.

## Architecture

```
POST /api/v1/co-pilot/ask  { query: string, context?: { page?, strategyId? } }
  → Intent Classifier (keyword-based → 5 predefined or fallback)
  → Handler (gathers data from existing trading services)
  → Response Formatter
  ← { answer: string, actions: ActionButton[], sourceData?: any }

ActionButton = { label: string, action: string, payload?: any }
  action types: 'navigate' | 'execute' | 'toggle'
```

## Files

```
Create:
├── src/platform/api/routes/co-pilot-routes.ts        — POST /ask endpoint
├── src/desk/intelligence/co-pilot/                    — NOTE: NOT platform/, intelligence lives in desk/
│   ├── index.ts                                       — Barrel exports
│   ├── intent-classifier.ts                           — Classify query → intent
│   ├── handlers/
│   │   ├── risk-handler.ts                            — Risk assessment
│   │   ├── arb-handler.ts                             — Arb scan
│   │   ├── performance-handler.ts                     — Strategy performance
│   │   ├── regime-handler.ts                          — Market regime
│   │   └── report-handler.ts                          — Weekly report
│   └── response-formatter.ts                          — Format answer + actions
└── src/platform/api/routes/__tests__/
    └── co-pilot-routes.test.ts                        — Integration tests

Modify:
└── src/platform/api/server.ts                         — Mount co-pilot routes
```

## Implementation Steps

### Step 1: Intent Classifier
Create `src/desk/intelligence/co-pilot/intent-classifier.ts`:

```typescript
type Intent = 'risk_assessment' | 'arb_scan' | 'strategy_performance' | 'market_regime' | 'weekly_report' | 'fallback'

// Keyword-based classification
const INTENT_PATTERNS: Record<Exclude<Intent, 'fallback'>, RegExp[]> = {
  risk_assessment: [/risk/i, /exposure/i, /drawdown/i, /overexposed/i, /circuit.?breaker/i],
  arb_scan: [/arb/i, /opportunit/i, /mispric/i, /spread/i, /hedge/i],
  strategy_performance: [/strategy/i, /performance/i, /win.?rate/i, /sharpe/i, /p&l/i, /profit/i],
  market_regime: [/regime/i, /market (doing|trend|state)/i, /trending/i, /ranging/i, /bull/i, /bear/i],
  weekly_report: [/report/i, /summary/i, /weekly/i, /overview/i, /digest/i],
}

export function classifyIntent(query: string): { intent: Intent; confidence: number } {
  // Check each pattern set, return highest confidence match
  // If no match → fallback with confidence 0
}
```

Test with sample queries:
- "what's my risk exposure?" → risk_assessment
- "find arb opportunities in Polymarket" → arb_scan
- "how are my strategies doing?" → strategy_performance
- "what's the market doing right now?" → market_regime
- "generate a weekly report" → weekly_report
- "who won the game last night?" → fallback (returns structured list of supported intents)

**IMPORTANT — Confidence threshold:** If no pattern matches with confidence >= 0.5, return fallback. Do NOT route low-confidence matches to any intent. The fallback should return a helpful message listing the 5 supported query types. AlphaEar client does NOT support free-text chat — do not attempt to use it as a general LLM chat.

### Step 2: Risk Handler
Create `src/desk/intelligence/co-pilot/handlers/risk-handler.ts`:

Use existing services:
- `KellyPositionSizer` — current position sizes
- `DrawdownMonitor` — drawdown %
- `CircuitBreaker` — circuit breaker state
- `PredictionAccuracyTracker` — recent performance

Output: `{ answer: string, riskScore: number, drawdown: number, positions: Position[], warnings: string[] }`

Format answer as markdown:
```
📊 **Risk Assessment**
- Risk score: 3.2/10 (low)
- Drawdown: 4.2% (within limits)
- Circuit breaker: OK
- Largest position: ETH/USDT at 18% of portfolio
⚠️ Strategy "momentum-v2" showing 3 consecutive losses
```

### Step 3: Arb Handler
Create `src/desk/intelligence/co-pilot/handlers/arb-handler.ts`:

Use existing services:
- `SpreadDetector` — detect spreads
- `CrossMarketArb` — cross-market arb opportunities
- `GammaClient` — Gamma API markets
- `LogicalHedgeDiscovery` — hedge discovery

Output top 5 arb opportunities with edge %.

### Step 4: Performance Handler
Create `src/desk/intelligence/co-pilot/handlers/performance-handler.ts`:

Use existing services:
- `PredictionAccuracyTracker` — win rate per strategy
- `BacktestRunner` — backtest results
- `strategy-registry.ts` — strategy names

Output: rankings by win rate, Sharpe, P&L.

### Step 5: Regime Handler
Create `src/desk/intelligence/co-pilot/handlers/regime-handler.ts`:

Use existing services:
- `detectRegime()` from regime-detector.ts — current market regime
- `SignalFusionEngine` — current fused signals
- `DnaEngine` — DNA context

Output: regime, confidence, TF analysis, signal summary.

### Step 6: Report Handler
Create `src/desk/intelligence/co-pilot/handlers/report-handler.ts`:

Gather data from all other handlers + TradeHistory.
Output: comprehensive weekly report in markdown.

### Step 7: POST /api/v1/co-pilot/ask Route
Create `src/platform/api/routes/co-pilot-routes.ts`:

```typescript
router.post('/api/v1/co-pilot/ask', requireTier('PRO'), async (req, res) => {
  const { query, context } = req.body
  
  // 1. Classify intent
  const { intent, confidence } = classifyIntent(query)
  
  // 2. Route to handler
  let result: CopilotResponse
  if (confidence >= 0.5) {
    switch (intent) {
      case 'risk_assessment': result = await handleRiskQuery(context); break
      case 'arb_scan': result = await handleArbQuery(); break
      case 'strategy_performance': result = await handlePerformanceQuery(); break
      case 'market_regime': result = await handleRegimeQuery(); break
      case 'weekly_report': result = await handleReportQuery(context); break
      case 'fallback': result = handleFallback(); break
    }
  } else {
    result = handleFallback()  // Below confidence threshold
  }
  
  // 3. Format response
  res.json(result)
})
```

**Rate limiting:** Add `distributed-rate-limiter.ts` middleware to this route. 10 requests/min per user (PRO), 30/min (ENTERPRISE+). Prevents cost-amplification attack on LLM-backed endpoint.

**IMPORTANT — AlphaEar does NOT support free-text chat:** The fallback handler should return a pre-formatted message listing the 5 supported query types:
```typescript
function handleFallback(): CopilotResponse {
  return {
    answer: "I can help you with these trading questions:\n\n" +
      "1. 📊 **Risk Assessment** — 'What is my risk exposure?'\n" +
      "2. 🔍 **Arb Scan** — 'Find arbitrage opportunities'\n" +
      "3. 📈 **Strategy Performance** — 'How are my strategies doing?'\n" +
      "4. 🌐 **Market Regime** — 'What is the market doing?'\n" +
      "5. 📋 **Weekly Report** — 'Generate a weekly report'\n\n" +
      "Try one of these!",
    actions: [
      { label: 'Risk Assessment', action: 'navigate', payload: '/risk' },
      { label: 'Scan Arb', action: 'execute', payload: 'arb_scan' },
      { label: 'Performance', action: 'navigate', payload: '/strategies' },
    ]
  }
}
```

Tier gating: PRO tier for all intents. FREE users see the fallback message only (no intent execution).

### Step 8: Fallback Handler
Create `src/desk/intelligence/co-pilot/handlers/fallback-handler.ts`:

IMPORTANT: AlphaEar client does NOT support free-text chat. It only handles structured requests (sentiment analysis, prediction, explanation). The fallback handler must return a helpful structured message with supported intents.

```typescript
import { CopilotResponse } from '../response-formatter'

export function handleFallback(): CopilotResponse {
  return {
    answer: [
      "I can help with these trading questions:\n",
      "1. 📊 **Risk Assessment** — 'What is my risk exposure?'",
      "2. 🔍 **Arb Scan** — 'Find arbitrage opportunities'",
      "3. 📈 **Strategy Performance** — 'How are my strategies doing?'",
      "4. 🌐 **Market Regime** — 'What is the market doing?'",
      "5. 📋 **Weekly Report** — 'Generate a weekly report'",
      "",
      "Try one of the quick actions below!",
    ].join('\n'),
    actions: [
      { label: '📊 Risk Assessment', action: 'execute', payload: 'risk_assessment' },
      { label: '🔍 Scan Arb', action: 'execute', payload: 'arb_scan' },
      { label: '📈 Performance', action: 'execute', payload: 'strategy_performance' },
      { label: '🌐 Market Regime', action: 'execute', payload: 'market_regime' },
      { label: '📋 Generate Report', action: 'execute', payload: 'weekly_report' },
    ]
  }
}
```

### Step 9: Mount Routes
Add to `src/platform/api/server.ts` or the appropriate router mounting:
```typescript
import { coPilotRouter } from './routes/co-pilot-routes'
// Mount at app level (server.ts or platform router)
server.use(coPilotRouter)
```

The server.ts imports API route files — follow the existing pattern for mounting.

### Step 10: Tests
Create `src/platform/api/routes/__tests__/co-pilot-routes.test.ts`:

- Each intent with sample query → returns correct intent
- Risk handler returns risk data
- Arb handler returns opportunities
- Performance handler returns strategy rankings
- Report handler returns markdown
- Fallback returns structured list of supported intents (NOT LLM chat)
- Invalid queries → fallback message
- Rate limiting works (429 after too many requests)
- XSS attempt via query parameter → sanitized in response
- Tier gating: FREE → fallback message only
- Tier gating: PRO → all 5 intents

## Related Files
- `src/platform/api/routes/co-pilot-routes.ts`
- `src/desk/intelligence/co-pilot/intent-classifier.ts`
- `src/desk/intelligence/co-pilot/handlers/risk-handler.ts`
- `src/desk/intelligence/co-pilot/handlers/arb-handler.ts`
- `src/desk/intelligence/co-pilot/handlers/performance-handler.ts`
- `src/desk/intelligence/co-pilot/handlers/regime-handler.ts`
- `src/desk/intelligence/co-pilot/handlers/report-handler.ts`
- `src/desk/intelligence/co-pilot/handlers/fallback-handler.ts`
- `src/desk/intelligence/co-pilot/response-formatter.ts`
- `src/platform/api/server.ts`
- `src/desk/risk/kelly-position-sizer.ts`
- `src/desk/intelligence/prediction-accuracy-tracker.ts`
- `src/desk/strategies/dna/regime-detector.ts` (NOTE: two detectRegime() locations exist — use the one at src/desk/strategies/dna/regime-detector.ts)
- `src/desk/intelligence/signal-fusion-engine.ts`
- `src/platform/middleware/distributed-rate-limiter.ts` (for rate limiting on co-pilot endpoint)

## Success Criteria
- [ ] 5 intent handlers return correct live data
- [ ] Fallback handler returns structured intent listing (no LLM chat — AlphaEar doesn't support it)
- [ ] POST /api/v1/co-pilot/ask returns valid responses for all intents
- [ ] Tier gating works: PRO → all 5 intents, FREE → fallback list only
- [ ] Response includes action buttons where applicable
- [ ] Rate limiting enforced: 10 req/min per PRO user
- [ ] Tests pass for all intents + edge cases

## Risk Assessment
- **Intent misclassification** — keyword matching may misfire. Mitigation: confidence threshold, if < 0.5 then structured fallback
- **Performance handler slow** — gathering data from multiple services. Mitigation: parallel Promise.all, AbortController with 5s timeout per handler
- **No free-text LLM chat** — AlphaEar does not support it. Fallback returns structured intent listing, not LLM response.
- **Rate limiting bypass** — without endpoint-specific rate limiter, PRO users can cause cost amplification. Mitigation: add distributed-rate-limiter to co-pilot route
