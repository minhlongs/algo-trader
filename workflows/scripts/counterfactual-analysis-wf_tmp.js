export const meta = {
  name: 'counterfactual-analysis',
  description: 'Implement counterfactual analysis: what-if scenarios, trade explanations, strategy improvement insights',
  phases: [
    { title: 'Counterfactual Planning', detail: 'Design counterfactual generation, evaluation metrics, API' },
    { title: 'Implementation', detail: 'Counterfactual generator using ML (DiCE, custom)' },
    { title: 'Integration with Trade Rationales', detail: 'Combine counterfactuals with XAI explanations' },
    { title: 'API Development', detail: 'REST API for counterfactual queries' },
    { title: 'UI Components', detail: 'Dashboard for counterfactual visualization' },
    { title: 'Testing & Sign-off', detail: 'Validation, user testing, production deployment' },
  ],
};

phase('Planning');
const planning = await agent('Counterfactual Plan', {
  label: 'counterfactual-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan counterfactual analysis. Task #327.

Use case: "What if I had taken a different action?"

For a trade:
- Actual: bought BTC at $50k, sold at $55k → profit $5k
- Counterfactual: what if sold at $52k? → profit $2k
- What if bought 2x size? → profit $10k

For strategy:
- What if used stop-loss at 5% vs 10%?
- What if held 1 day longer?

Approach:
1. ML-based: train model to predict P&L given action
2. Generate counterfactuals: vary inputs, predict outcomes
3. Evaluate: realistic, diverse, feasible

Create plan: ./plans/counterfactual-analysis/plan.md

`,
});

phase('Implementation');
const impl = await parallel([
  () => agent('Implement Counterfactual Generator', {
    label: 'counterfactual-gen',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement counterfactual generator.

Approach: DiCE (Diverse Counterfactual Explanations) or custom.

For a trade (context C, action A, outcome O):
Generate counterfactual actions A' such that:
- Predicted outcome O' = model(C, A')
- A' is feasible (within constraints: balance, market)
- Diverse: multiple distinct alternatives
- Closest to actual action (minimize distance)

Implementation:
- src/ai/counterfactual/counterfactual-generator.ts
- Uses prediction model (Strategy DNA or simpler)
- Generates: 3-5 counterfactuals per query
- Constraints: max_position_size, available_balance, market_liquidity

`,
  }),
  () => agent('Train Counterfactual Model', {
    label: 'cf-model-train',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Train model for counterfactual predictions.

Model: Predict P&L given context and action.

Features (context):
- Market state: regime, volatility, trend
- Portfolio: current positions, balance, risk exposure
- Time: time of day, day of week

Action features:
- Order type (market/limit)
- Side (buy/sell)
- Quantity
- Price (if limit)

Target: realized P&L (after trade closed)

Train on historical trades dataset.

Model: Gradient Boosting or Neural Network.

`,
  }),
]);

phase('Integration');
const integration = await parallel([
  () => agent('Integrate with XAI Trade Rationales', {
    label: 'cf-xai-integration',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Combine counterfactuals with XAI:

For a completed trade, API GET /api/v1/trades/:id/explanation returns:

{
  "trade_id": "...",
  "actual_outcome": { "pnl": 5000, "sharpe": 1.2 },
  "feature_importance": { "regime": 0.35, "timing": 0.25, ... },
  "counterfactuals": [
    { "action": { "quantity": 0.2, "price": 52000 }, "predicted_pnl": 2000, "difference": -3000 },
    { "action": { "quantity": 0.2, "price": 48000 }, "predicted_pnl": 8000, "difference": +3000 },
    ...
  ],
  "strategy_rules": [...]
}

Service: src/services/trade-explanation.service.ts combines SHAP + counterfactuals.

`,
  }),
  () => agent('Implement Strategy-Level Counterfactuals', {
    label: 'strategy-cf',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Strategy-level counterfactuals:

"What if we changed strategy parameter X?"

Examples:
- Current: stop-loss 5%, take-profit 10%
- Counterfactual: stop-loss 10%, take-profit 20% → predicted Sharpe +0.3
- Counterfactual: use trailing stop → predicted Sharpe +0.1

Parameters to vary:
- Risk parameters (stop-loss, max position)
- Entry signals (thresholds)
- Time holding (exit rules)

API: GET /api/v1/strategies/:id/counterfactuals?parameter=stop_loss_pct&values=[5,10,15]

`,
  }),
]);

phase('API Development');
const api = await parallel([
  () => agent('Create Counterfactual API', {
    label: 'cf-api',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Counterfactual API:

Trade counterfactual:
GET /api/v1/trades/:id/counterfactuals
Response: { trade_id, counterfactuals: [...] }

Strategy counterfactual:
GET /api/v1/strategies/:id/counterfactuals?parameter=...&values=[...]
Response: { strategy_id, parameter, results: [{value, predicted_sharpe, predicted_pnl}] }

Generate on-the-fly:
POST /api/v1/counterfactuals/generate
Body: { context: {...}, action: {...}, num_counterfactuals: 5 }
Response: same as trade counterfactual

`,
  }),
  () => agent('Implement Counterfactual Caching', {
    label: 'cf-cache',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Cache counterfactual results.

Counterfactuals expensive to compute (model inference).

Cache in Redis:
- Key: hash(context + action + num)
- TTL: 1 hour (market changes)
- Store: generated counterfactuals

Cache invalidation:
- New trade in same context → invalidate related keys
- Model retraining → flush cache

Implementation: src/services/counterfactual-cache.service.ts

`,
  }),
]);

phase('UI Components');
const ui = await parallel([
  () => agent('Create Counterfactual Dashboard', {
    label: 'cf-dashboard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Counterfactual visualization dashboard.

Components:
1. Trade details: actual P&L, decision factors
2. Counterfactual cards:
   - "What if you traded 2x size?" → +$2,000
   - "What if you held 1 day longer?" → +$500
   - "What if stop-loss at 10%?" → -$200 (worse)
3. Slider: adjust quantity, see predicted P&L curve
4. Compare: radar chart comparing actual vs counterfactual feature values

React components:
- src/dashboard/strategy/TradeCounterfactuals.tsx
- src/dashboard/strategy/StrategyCounterfactuals.tsx

`,
  }),
  () => agent('Add Counterfactuals to Trade History', {
    label: 'trade-history-cf',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Add counterfactual column to trade history table.

Table columns:
- Date, Symbol, Side, Quantity, Price, P&L
- "What If" button → opens modal with counterfactuals

On click: modal shows 3-5 alternative actions and outcomes.

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Validate Counterfactual Quality', {
    label: 'cf-quality',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Validate counterfactual quality:

1. Feasibility: all counterfactual actions are feasible (balance, market)
2. Diversity: counterfactuals are distinct (not just +1% quantity variations)
3. Plausibility: predicted outcomes are reasonable (not extreme)
4. Distance: counterfactuals are close to actual action (L2 distance)
5. Usefulness: user can learn from alternatives

User study: 5 traders rate usefulness 1-5, target average >4.

`,
  }),
  () => agent('Counterfactual Sign-off', {
    label: 'cf-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off counterfactual analysis.

Review:
✅ Implementation complete
✅ Integrated with XAI
✅ API and UI
✅ Quality validated
✅ User testing positive

Decision: PRODUCTION READY.

`,
  }),
]);

log('Counterfactual Analysis workflow launched');