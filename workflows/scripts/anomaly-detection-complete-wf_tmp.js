export const meta = {
  name: 'anomaly-detection-complete',
  description: 'Complete anomaly detection system: market data anomalies, regime changes, outlier detection, alerts',
  phases: [
    { title: 'Anomaly Detection Planning', detail: 'Design anomaly detection architecture, model selection, integration points' },
    { title: 'Market Data Anomaly Detection', detail: 'Detect price/volume anomalies, exchange issues' },
    { title: 'Regime Detection Service', detail: 'Unified regime detection (trend, range, volatile)' },
    { title: 'Outlier Detection', detail: 'Statistical outlier detection for trading signals' },
    { title: 'Alerting & Integration', detail: 'Integrate alerts with monitoring, StrategyShard' },
    { title: 'Testing & Sign-off', detail: 'Backtesting, integration tests, production validation' },
  ],
};

phase('Planning');
const planning = await agent('Anomaly Detection Plan', {
  label: 'anomaly-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan anomaly detection system completion. Tasks #42, #84.

Current: Phase 1 likely done, need completion.

Scope:
- Market data anomaly detection (price spikes, volume anomalies, exchange failures)
- Regime detection (trend vs range vs volatile)
- Outlier detection for trading signals
- Alerting integration

Create plan in ./plans/anomaly-detection-complete/plan.md.

Work context: /Users/macbook/algo-trader
`,
});

phase('Market Data Anomalies');
const marketAnomalies = await parallel([
  () => agent('Implement Market Data Anomaly Detection', {
    label: 'market-anomaly-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Detect market data anomalies: price spikes, volume anomalies, exchange failures.

Methods:
1. Price spike detection:
   - Z-score of price changes (>5 sigma)
   - Sudden momentum (10% in 1min)
   - Isolated spike (single tick vs smooth)
2. Volume anomaly:
   - Volume surge (>10x average)
   - Volume dry-up (<10% of average)
3. Exchange health:
   - Stale ticks (no update > 5s)
   - Gap detection (missing ticks)
   - Order book anomalies

Implementation:
- Service: src/services/market-anomaly-detector.ts
- Subscribe to market data feed
- Real-time detection with rolling statistics
- Alert on anomalies with severity

Files: src/services/market-anomaly-detector.ts, tests/services/market-anomaly.test.ts
`,
  }),
  () => agent('Test Market Anomaly Detection', {
    label: 'market-anomaly-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test market anomaly detection.

Scenarios:
1. Price spike: inject 20% jump → detected
2. Volume surge: 10x normal volume → alert
3. Exchange stall: stop ticks → detected
4. False positives: normal volatility not flagged
5. Detection latency: <1s from event

Return: Test report with precision/recall.
`,
  }),
]);

phase('Regime Detection');
const regime = await parallel([
  () => agent('Implement Unified Regime Detection Service', {
    label: 'regime-detection-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement unified regime detection service.

Regimes:
- Trend (up/down, strength)
- Range (consolidation)
- Volatile (high volatility, choppy)
- Normal

Features:
1. Regime detector: src/services/regime-detector.ts
   - Input: price series, volume, indicators (ATR, RSI, ADX)
   - Output: regime label, confidence, duration
2. ML model: HMM or simple rule-based initially
3. Caching: regime per symbol, update every 5min
4. API: GET /api/v1/market/regime?symbol=BTC-USD
5. Strategy integration: StrategyShard uses regime for position sizing

Files: src/services/regime-detector.ts, tests/services/regime-detector.test.ts
`,
  }),
  () => agent('Test Regime Detection', {
    label: 'regime-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test regime detection.

Validate:
1. Uptrend: price making higher highs/lows → "trend-up"
2. Downtrend: lower highs/lows → "trend-down"
3. Range: bounded between support/resistance → "range"
4. Volatile: high ATR, choppy → "volatile"
5. Transition detection: regime change detected within 3 bars
6. Backtest: regime labels match manual labeling (>80% accuracy)

Return: Regime detection test report.
`,
  }),
]);

phase('Outlier Detection');
const outliers = await parallel([
  () => agent('Implement Signal Outlier Detection', {
    label: 'outlier-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement outlier detection for trading signals.

Detect outliers in:
- Prediction model outputs (price predictions)
- Signal strength indicators
- Feature values

Methods:
1. Statistical: IQR, modified Z-score
2. ML: Isolation Forest, One-Class SVM
3. Contextual: compare to recent history, market regime

Implementation:
- src/services/outlier-detector.ts
- Flag signals as outlier if probability < 0.01
- Downweight or reject outlier signals
- Log for investigation

Files: src/services/outlier-detector.ts, tests/services/outlier-detector.test.ts
`,
  }),
  () => agent('Test Outlier Detection', {
    label: 'outlier-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test outlier detection.

1. Inject outlier prediction (10 sigma from mean) → flagged
2. Normal predictions → not flagged
3. Contextual: valid signal in volatile regime not outlier, but in range regime outlier
4. False positive rate: <5%
5. Detection improves strategy performance when filtering

Return: Outlier detection test report.
`,
  }),
]);

phase('Alerting Integration');
const alertIntegration = await parallel([
  () => agent('Integrate Anomaly Alerts', {
    label: 'anomaly-alert-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Integrate anomaly alerts with monitoring stack.

Alerts:
1. Critical anomalies: P0 alert (PagerDuty/SMS)
   - Exchange failure
   - Price spike >20%
   - Regime change to volatile (risk off)
2. Warning anomalies: P1 (Slack)
   - Volume anomaly
   - Outlier signal detected
   - Stale market data

Implementation:
- Prometheus metrics: market_anomaly_total{type, severity}
- Alertmanager rules: config/prometheus/rules/anomalies.yml
- Grafana dashboard: anomaly timeline, frequency

Files: config/prometheus/rules/anomalies.yml, config/grafana/dashboards/anomalies.json
`,
  }),
  () => agent('StrategyShard Integration', {
    label: 'strategy-integration-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Integrate anomaly detection with StrategyShard.

Integration:
1. StrategyShard subscribes to regime updates
2. On regime change, adjust position sizing
3. On outlier signal, reject trade or reduce size
4. On market data anomaly, pause trading for that symbol

Implementation in: src/workers/strategy-shard.ts

Add handlers for:
- regime-update event
- anomaly-alert event
- outlier-signal event

Tests: strategy behavior with anomalies.

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Run Anomaly Detection Integration Tests', {
    label: 'anomaly-integration',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Run comprehensive integration tests for anomaly detection.

1. End-to-end: market data → anomaly detected → alert fired → StrategyShard reacts
2. Backtest: apply anomaly filter to historical data, measure strategy Sharpe improvement
3. Load test: 100 symbols, 1000 updates/sec, detection latency <1s
4. False positive analysis: reduce noise

Return: Full integration test report.
`,
  }),
  () => agent('Anomaly Detection Sign-off', {
    label: 'anomaly-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off for anomaly detection system.

Review:
✅ Market data anomaly detection
✅ Regime detection service
✅ Outlier detection
✅ Alerting integration
✅ StrategyShard integration
✅ Tests passing (unit + integration)
✅ Documentation

Decision: PRODUCTION or BLOCK.

Return: Sign-off report.
`,
  }),
]);

log('Anomaly Detection workflow launched');