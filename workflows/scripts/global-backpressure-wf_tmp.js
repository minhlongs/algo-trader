export const meta = {
  name: 'global-backpressure-circuit-breaker',
  description: 'Implement global backpressure circuit breaker: multi-shard flow control, adaptive throttling, cascade failure prevention',
  phases: [
    { title: 'Backpressure Planning', detail: 'Design circuit breaker states, thresholds, recovery strategy' },
    { title: 'Circuit Breaker Core', detail: 'Implement multi-region circuit breaker with hysteresis' },
    { title: 'Adaptive Throttling', detail: 'Dynamic RPS limits based on health signals' },
    { title: 'Cascade Prevention', detail: 'Prevent failure propagation between shards' },
    { title: 'Integration Testing', detail: 'Chaos scenarios: overload, latency spikes, failures' },
    { title: 'Production Tuning', detail: 'Threshold calibration, alerting, dashboards' },
  ],
};

phase('Planning');
const planning = await agent('Backpressure Plan', {
  label: 'backpressure-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan global backpressure circuit breaker. Tasks #234, #229.

Problem: Cascading failures when one shard/region overloads affects others.

Scope:
1. Circuit breaker per shard + global
2. Metrics: error rate, latency, queue depth
3. States: CLOSED → OPEN → HALF-OPEN → CLOSED
4. Adaptive throttling: reduce RPS when circuit open
5. Cascade prevention: isolate failures

Create plan in ./plans/global-backpressure/plan.md.

Work context: /Users/macbook/algo-trader
`,
});

phase('Circuit Breaker Core');
const cbCore = await parallel([
  () => agent('Implement Multi-Region Circuit Breaker', {
    label: 'circuit-breaker-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement circuit breaker with multi-region awareness.

Per-shard circuit breaker:
1. State machine: CLOSED (normal), OPEN (reject), HALF-OPEN (test)
2. Metrics: error rate (5xx), latency (p99), queue depth
3. Thresholds:
   - Error rate > 5% for 10s → OPEN
   - Latency > 1s for 30s → OPEN
   - Queue depth > 1000 for 60s → OPEN
4. Open duration: 30s minimum, then HALF-OPEN (allow 10% traffic)
5. Half-OPEN success threshold: 90% success → CLOSED, else OPEN

Implementation:
- src/services/circuit-breaker.service.ts
- Stores state in Redis per shard: "cb:{shard_id}" → { state, last_change, failure_count }
- Middleware: check circuit before routing request

Files: src/services/circuit-breaker.service.ts, src/middleware/circuit-breaker-middleware.ts, tests/services/circuit-breaker.test.ts

`,
  }),
  () => agent('Implement Global Circuit Breaker', {
    label: 'global-cb-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement global circuit breaker for cross-region failures.

Monitors:
1. Regional health: all shards in region
2. Cross-region latency: p99 between regions
3. Replication lag: D1 and Redis replication

Global OPEN triggers:
- Any region all shards in circuit breaker OPEN
- Cross-region latency > 500ms
- Replication lag > 30s

Global state affects load balancer: route all traffic to healthy regions only.

`,
  }),
]);

phase('Adaptive Throttling');
const throttling = await parallel([
  () => agent('Implement Adaptive Throttling', {
    label: 'adaptive-throttle-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Adaptive throttling based on circuit breaker state.

When circuit breaker OPEN for shard:
1. Reject new requests immediately (503)
2. Or queue with high timeout (not recommended)
3. Return Retry-After header: 30s

When circuit HALF-OPEN:
1. Allow only 10% of traffic through
2. Use token bucket with reduced rate
3. Fast-fail on errors to re-open circuit

Dynamic per-tenant RPS limit:
- Base limit per tenant plan
- Multiply by shard health factor (0-1)
- If circuit open → factor = 0 (reject all)

Implementation in rate-limiter middleware.

`,
  }),
  () => agent('Implement Health Scoring', {
    label: 'health-scoring-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Health scoring for adaptive decisions.

Score per shard (0-100):
- Error rate (weight 40%): 100 - (error_rate * 1000)
- Latency (weight 30%): 100 - (p99_latency * 10)
- Queue depth (weight 20%): 100 - (queue_depth / 10)
- CPU usage (weight 10%): 100 - cpu_percent

Aggregate: weighted sum

Health factor = score / 100

Use score to adjust throttling dynamically.

`,
  }),
]);

phase('Cascade Prevention');
const cascade = await parallel([
  () => agent('Implement Isolation Barriers', {
    label: 'isolation-barriers-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Isolation barriers to prevent cascade failures.

1. Resource pools per tenant (already exists) → tenant isolation
2. Circuit breakers per shard → shard isolation
3. Timeout per request → prevent slow consumer propagation
4. Bulkhead pattern: separate thread pools for different operations
5. Fallback handlers: degrade gracefully (cache, stale data)

Add:
- Request timeout middleware (configurable per endpoint)
- Fallback service: src/services/fallback.service.ts
  - Cache responses (Redis)
  - Stale data acceptable for some queries

`,
  }),
  () => agent('Implement Graceful Degradation', {
    label: 'degradation-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Graceful degradation when shard unavailable.

Scenarios:
1. Read from shard failure → fallback to replica or cache
2. Write failure → queue for later (async) or reject with clear error
3. Cross-shard transaction → partial success handling (compensating transactions)

Implementation:
- src/middleware/graceful-degradation.ts
- For read: try replica if primary circuit open
- For write: if circuit open → reject immediately with 503
- For cross-shard: two-phase commit with compensation

`,
  }),
]);

phase('Integration Testing');
const integration = await parallel([
  () => agent('Chaos Scenario Testing', {
    label: 'backpressure-chaos',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Chaos test backpressure system:

1. Overload shard: send 10x normal RPS → circuit opens, traffic throttled
2. Latency spike: inject 5s delay on shard → circuit opens
3. Kill shard: DO crashes → circuit opens
4. Recovery: shard returns → half-open, gradual recovery
5. Cascade: overload shard A → verify shard B unaffected
6. Regional failure: all shards in region down → global circuit opens

Tools: chaos-engineering tests (from earlier workflow).

`,
  }),
  () => agent('Test Adaptive Throttling', {
    label: 'throttling-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test adaptive throttling:

1. Circuit CLOSED: 1000 RPS allowed
2. Circuit OPEN: 0 RPS allowed (reject)
3. Circuit HALF-OPEN: 100 RPS allowed (10% of normal)
4. Health score 50 → RPS limit = base * 0.5
5. Verify: throttled requests get 429 or 503 with Retry-After

`,
  }),
]);

phase('Production Tuning');
const tuning = await parallel([
  () => agent('Tune Circuit Breaker Thresholds', {
    label: 'cb-tuning',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Tune circuit breaker thresholds in production.

Start with conservative thresholds:
- Error rate: 5% over 10s
- Latency: 1s p99 over 30s
- Queue depth: 1000 over 60s

Monitor first 24h:
- How many times did each circuit open?
- Was it justified (shard actually unhealthy)?
- False positives: circuit opened but shard was fine

Adjust:
- Too sensitive → increase thresholds or duration
- Not sensitive enough → decrease thresholds

`,
  }),
  () => agent('Create Backpressure Dashboards', {
    label: 'backpressure-dash',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Create backpressure dashboards in Grafana.

Panels:
1. Circuit state by shard (table: CLOSED/OPEN/HALF-OPEN)
2. Circuit open events timeline
3. Error rate per shard
4. Latency p99 per shard
5. Queue depth per shard
6. Health score heatmap

JSON: config/grafana/dashboards/backpressure.json

`,
  }),
  () => agent('Configure Backpressure Alerts', {
    label: 'backpressure-alerts',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure Alertmanager alerts for backpressure:

1. Circuit OPEN: P1 alert to SRE Slack
2. Circuit stuck OPEN > 5min: P0 alert (PagerDuty)
3. Global circuit OPEN: P0 alert
4. High throttling rate: >50% requests throttled

Alert rules in config/prometheus/rules/backpressure.yml

`,
  }),
  () => agent('Backpressure Sign-off', {
    label: 'backpressure-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off global backpressure system.

Review:
✅ Circuit breaker implemented (per-shard + global)
✅ Adaptive throttling working
✅ Cascade prevention in place
✅ Integration/chaos tests passing
✅ Dashboards created
✅ Alerts configured
✅ Production tuning complete

Decision: PRODUCTION READY.

`,
  }),
]);

log('Global Backpressure workflow launched');