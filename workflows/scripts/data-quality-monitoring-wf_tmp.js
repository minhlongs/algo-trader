export const meta = {
  name: 'data-quality-monitoring',
  description: 'Implement data quality monitoring for market data providers: completeness, accuracy, latency, anomaly detection',
  phases: [
    { title: 'Data Quality Planning', detail: 'Define quality dimensions, SLAs, alert thresholds' },
    { title: 'Market Data Validation', detail: 'Validate price, volume, timestamp accuracy' },
    { title: 'Completeness Monitoring', detail: 'Track missing ticks, gaps, stale data' },
    { title: 'Accuracy Verification', detail: 'Cross-exchange price comparison' },
    { title: 'Provider Health Dashboard', detail: 'Real-time data quality dashboard' },
    { title: 'Alerting & Incident Response', detail: 'Data quality alerts, auto-failover' },
    { title: 'Testing & Sign-off', detail: 'Validation, production deployment' },
  ],
};

phase('Planning');
const planning = await agent('Data Quality Plan', {
  label: 'data-quality-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan data quality monitoring. Task #228.

Data quality dimensions:
1. Completeness: all expected symbols updating, no gaps
2. Accuracy: prices match reference (other exchanges, consolidators)
3. Latency: time from exchange to ingestion < threshold
4. Consistency: no out-of-order timestamps
5. Validity: reasonable values (price > 0, volume >= 0)

Providers: Binance, Coinbase, KuCoin, Polymarket, aggregators.

Create plan: ./plans/data-quality-monitoring/plan.md
`,
});

phase('Market Data Validation');
const validation = await parallel([
  () => agent('Implement Price Validation', {
    label: 'price-validation',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Price validation rules:

1. Price > 0
2. Price < sanity_max (e.g., $1M for BTC, $100 for ETH)
3. Price change per tick < 50% (except rare flash crashes)
4. Bid-Ask spread reasonable (0.1% - 10%)
5. No negative prices

Implementation:
- src/services/data-quality/price-validator.ts
- Called from market data ingestion pipeline
- Invalid data: log, reject, alert

`,
  }),
  () => agent('Implement Timestamp Validation', {
    label: 'timestamp-validation',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Timestamp validation:

1. Timestamp not in future (clock skew check)
2. Timestamp not too old (> 60s stale)
3. Monotonic: sequence numbers or timestamps increasing
4. Timezone consistency (UTC)

Out-of-order detection: buffer 5s, reorder.

`,
  }),
]);

phase('Completeness Monitoring');
const completeness = await parallel([
  () => agent('Track Missing Ticks', {
    label: 'missing-ticks',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Missing tick detection:

Expected: regular updates (every 100ms-1s for active symbols)

Detect gaps:
1. Track last update time per symbol per exchange
2. If no update for > expected_interval * 3 → missing tick alert
3. Count consecutive missing ticks
4. Alert thresholds:
   - Warning: 3 missing ticks
   - Critical: 10 missing ticks

Metrics: exchange_missing_ticks_total{exchange, symbol}

`,
  }),
  () => agent('Monitor Symbol Coverage', {
    label: 'symbol-coverage',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Symbol coverage monitoring:

Expected symbols per exchange (config):
- Binance: BTC-USD, ETH-USD, 100+ altcoins
- Coinbase: BTC-USD, ETH-USD, 50+ altcoins

Check:
1. All expected symbols receiving data
2. No unexpected symbols (could indicate misconfiguration)
3. New symbols appear → auto-add to watchlist?

Alert: expected symbol missing for >5min.

`,
  }),
]);

phase('Accuracy Verification');
const accuracy = await parallel([
  () => agent('Cross-Exchange Price Comparison', {
    label: 'cross-exchange-compare',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Cross-exchange price comparison:

For liquid symbols (BTC, ETH):
1. Compare price across exchanges
2. Compute deviation: (price - median) / median
3. Threshold: deviation > 2% → anomaly
4. Some exchanges may legitimately differ (liquidity, region)

Implementation:
- Poll all exchanges every 10s
- Calculate median price
- Flag outliers
- Don't alert if outlier exchange has known liquidity issues

`,
  }),
  () => agent('Verify Volume Accuracy', {
    label: 'volume-accuracy',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Volume accuracy checks:

1. Volume >= 0
2. Volume not absurdly high (compare to 24h average)
3. Volume cumulative over day matches exchange reported 24h volume (rough check)
4. Zero volume for extended period → warning (maybe market closed)

`,
  }),
]);

phase('Provider Health Dashboard');
const dashboard = await parallel([
  () => agent('Create Data Quality Dashboard', {
    label: 'data-quality-dash',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Data quality dashboard:

Panels:
1. Data quality score per exchange (0-100)
2. Missing ticks by symbol (heatmap)
3. Latency by exchange (p50, p95, p99)
4. Price anomalies detected
5. Completeness: % symbols with fresh data
6. Top problematic symbols

Grafana: config/grafana/dashboards/data-quality.json

`,
  }),
  () => agent('Implement Quality Score Calculation', {
    label: 'quality-score',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Quality score algorithm:

Score = 0-100 based on:
- Completeness (40%): % expected ticks received
- Latency (30%): p99 latency score (lower latency = higher score)
- Accuracy (20%): % ticks passing validation
- Availability (10%): % time exchange reachable

Calculate per exchange, per symbol, overall.

Expose: GET /api/v1/data-quality/scores

`,
  }),
]);

phase('Alerting & Incident Response');
const alerts = await parallel([
  () => agent('Configure Data Quality Alerts', {
    label: 'data-quality-alerts',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Data quality alerts:

1. Exchange down: no data for 2min → P1
2. High missing tick rate: >10% ticks missing → P1
3. High latency: p99 > 5s → P2
4. Price anomaly cluster: many symbols from same exchange deviating → P1 (possible outage)
5. Quality score < 50 → P2

Alert routing:
- Exchange-specific alerts → SRE
- Global degradation → Engineering Manager

`,
  }),
  () => agent('Implement Auto-Failover on Data Quality', {
    label: 'auto-failover',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Auto-failover on data quality issues:

If exchange data quality score < 30 for >5min:
1. Mark exchange as degraded in config (Redis key)
2. StrategyShard stops using that exchange for signals
3. Switch to backup data source (if available)
4. Notify SRE

Manual override: POST /api/v1/admin/exchanges/:id/force-enable

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Validate Data Quality Metrics', {
    label: 'quality-validation',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Validate data quality metrics:

1. Inject bad data (missing ticks, high latency, wrong prices)
2. Verify detected and scored correctly
3. Verify alerts fire
4. Auto-failover triggers when quality poor

Test with real market data replay.

`,
  }),
  () => agent('Data Quality Sign-off', {
    label: 'data-quality-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off data quality monitoring.

Review:
✅ Validation rules implemented
✅ Completeness tracking
✅ Accuracy verification
✅ Health dashboard
✅ Alerting configured
✅ Auto-failover working
✅ Testing passed

Decision: DATA QUALITY MONITORING PRODUCTION READY.

`,
  }),
]);

log('Data Quality Monitoring workflow launched');