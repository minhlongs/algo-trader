# Phase 9: Rollback Strategy (L0-L4 Tiers)

**Priority:** High (Production safety)  
**Status:** Not Started  
**Estimated Effort:** 2 days

---

## Context Links

- Existing rollback: `docs/ai-first-enforcement-gates.md` (L0-L4 tiers for Qwen)
- Current kill switches: `src/wiring/qwen-signals-loop.ts`, `src/wiring/qwen-live-eligibility-gate.ts`
- Risk manager: `src/risk/drawdown-monitor.ts`, `src/risk/tiered-drawdown-breaker.ts`
- Alerting: `docker/grafana/provisioning/alerting/`

---

## Overview

The platform already has a 5-tier rollback hierarchy for the Qwen signal pipeline. This phase extends that framework to cover the new scaling infrastructure (sharding, multi-region, model tiering, connection pools). Each tier provides progressively more aggressive fallback mechanisms.

**Rollback Tiers:**

| Tier | Scope | Trigger | Action | Recovery |
|------|-------|---------|--------|----------|
| L0 | Observability | Signal quality < threshold | Queue review task | Manual |
| L1 | Kill Switch | Manual admin action | Immediate halt | Manual resume |
| L2 | Feature Flag | Automated disable flag | Disable feature | Auto-enable after cooldown |
| L3 | Circuit Breaker | Error rate > threshold | Fail closed for duration | Auto-recovery |
| L4 | Hard Gate | Configuration limit | Block operation | Config change |

**Goal:** Implement automated rollback for sharding, multi-region, model tiering, and connection pooling with <30s recovery time for L3/L4.

---

## Requirements

### Functional Requirements

1. **Shard rollback** - Degrade to single DO if sharding fails
2. **Multi-region fallback** - Route to single region if health check fails
3. **Model tier fallback** - Opus→Sonnet→Haiku cascade on timeout/error
4. **Connection pool degradation** - Fall back to direct fetch if pool exhausted
5. **Automated triggers** - Circuit breakers for each subsystem
6. **Manual overrides** - Admin API for immediate rollback

### Non-Functional Requirements

1. **Recovery time**: <30s for L3/L4 automatic recovery
2. **False positive rate**: <5% for automated triggers
3. **Observability**: All rollback events logged and alerted
4. **Test coverage**: Each tier tested in isolation
5. **Documentation**: Clear runbooks for manual intervention

---

## Extended Rollback Architecture

```
                    ┌─────────────────────────────────────┐
                    │      Rollback Controller            │
                    │  (Centralized decision engine)      │
                    └───────────────┬─────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                   ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │ Shard Manager│  │Region Router │  │Model Dispatcher│
        │  (L3/L4)     │  │  (L3/L4)     │  │  (L3/L4)     │
        └──────────────┘  └──────────────┘  └──────────────┘
                │                   │                   │
                ▼                   ▼                   ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │ Single DO    │  │ us-east only │  │ Haiku only   │
        │ fallback     │  │  fallback    │  │  fallback    │
        └──────────────┘  └──────────────┘  └──────────────┘

                    ┌─────────────────────────────────────┐
                    │      Kill Switch (L1)               │
                    │  ┌─────────────┬─────────────┐    │
                    │  │ Qwen Admin  │ Scaling Ctrl │    │
                    │  └─────────────┴─────────────┘    │
                    └─────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create Tiered Rollback Controller

**File to create:** `src/rollback/tiered-rollback-controller.ts`

```typescript
export enum RollbackTier {
  L0_OBSERVABILITY = 'L0_OBSERVABILITY',
  L1_KILL_SWITCH = 'L1_KILL_SWITCH',
  L2_FEATURE_FLAG = 'L2_FEATURE_FLAG',
  L3_CIRCUIT_BREAKER = 'L3_CIRCUIT_BREAKER',
  L4_HARD_GATE = 'L4_HARD_GATE',
}

export enum RollbackComponent {
  SHARDING = 'SHARDING',
  MULTI_REGION = 'MULTI_REGION',
  MODEL_TIERING = 'MODEL_TIERING',
  CONNECTION_POOL = 'CONNECTION_POOL',
  AGENT_COORDINATION = 'AGENT_COORDINATION',
}

interface RollbackState {
  tier: RollbackTier;
  component: RollbackComponent;
  triggeredAt: number;
  reason: string;
  autoRecovery: boolean;
  recoveryAfterMs: number;
}

class TieredRollbackController {
  private states: Map<RollbackComponent, RollbackState> = new Map();
  private redis: RedisClientType;

  // Thresholds for automated triggers
  private readonly thresholds = {
    shardErrorRate: 0.05,        // 5% errors
    regionLatencyP95: 200,       // 200ms
    modelTimeoutRate: 0.1,       // 10% timeouts
    queueDepth: 100,             // 100 queued
    memoryUtilization: 0.9,      // 90% of limit
  };

  constructor(private redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  // L0: Observability - just alert, no action
  async checkL0(component: RollbackComponent, metrics: ComponentMetrics): Promise<boolean> {
    const degraded = this.isDegraded(component, metrics);

    if (degraded) {
      await this.redis.lpush('rollback:l0:events', JSON.stringify({
        component,
        metrics,
        timestamp: Date.now(),
      }));
      await this.redis.ltrim('rollback:l0:events', 0, 999);

      // Queue review task
      await this.queueReviewTask(component, metrics);
      return true;
    }

    return false;
  }

  // L1: Kill Switch - immediate halt
  async triggerL1(component: RollbackComponent, reason: string): Promise<void> {
    const state: RollbackState = {
      tier: RollbackTier.L1_KILL_SWITCH,
      component,
      triggeredAt: Date.now(),
      reason,
      autoRecovery: false,
      recoveryAfterMs: 0,
    };

    this.states.set(component, state);
    await this.redis.hset('rollback:active', component, JSON.stringify(state));

    // Execute immediate halt
    await this.executeHalt(component);

    // Alert
    await this.alert('CRITICAL', `${component} halted: ${reason}`);
  }

  // L2: Feature Flag - configurable enable/disable
  async checkL2(component: RollbackComponent): Promise<boolean> {
    const flag = await this.redis.get(`feature:${component}:enabled`);
    const disabled = flag === 'false';

    if (disabled) {
      const state: RollbackState = {
        tier: RollbackTier.L2_FEATURE_FLAG,
        component,
        triggeredAt: Date.now(),
        reason: 'Feature flag disabled',
        autoRecovery: false,
        recoveryAfterMs: 0,
      };
      this.states.set(component, state);
      return true;
    }

    return false;
  }

  // L3: Circuit Breaker - temporary block with auto-recovery
  async checkL3(component: RollbackComponent, metrics: ComponentMetrics): Promise<boolean> {
    const state = this.states.get(component);

    // Check if circuit is already open
    if (state?.tier === RollbackTier.L3_CIRCUIT_BREAKER) {
      const elapsed = Date.now() - state.triggeredAt;
      if (elapsed < state.recoveryAfterMs) {
        return true; // Still in timeout
      }
      // Circuit half-open, allow test request
      this.states.delete(component);
    }

    // Check thresholds
    if (this.isDegraded(component, metrics)) {
      const newState: RollbackState = {
        tier: RollbackTier.L3_CIRCUIT_BREAKER,
        component,
        triggeredAt: Date.now(),
        reason: `Circuit breaker: ${this.getDegradationReason(component, metrics)}`,
        autoRecovery: true,
        recoveryAfterMs: 5 * 60 * 1000, // 5 minute timeout
      };
      this.states.set(component, newState);
      await this.redis.hset('rollback:active', component, JSON.stringify(newState));
      return true;
    }

    return false;
  }

  // L4: Hard Gate - configuration limit
  async checkL4(component: RollbackComponent, value: number, limit: number): Promise<boolean> {
    if (value >= limit) {
      const state: RollbackState = {
        tier: RollbackTier.L4_HARD_GATE,
        component,
        triggeredAt: Date.now(),
        reason: `Hard limit breached: ${value} >= ${limit}`,
        autoRecovery: false,
        recoveryAfterMs: 0,
      };
      this.states.set(component, state);
      await this.redis.hset('rollback:active', component, JSON.stringify(state));
      return true;
    }
    return false;
  }

  // Main evaluation loop
  async evaluate(component: RollbackComponent, metrics: ComponentMetrics, valueCheck?: { value: number; limit: number }): Promise<RollbackTier | null> {
    // Check L4 first (highest priority)
    if (valueCheck && await this.checkL4(component, valueCheck.value, valueCheck.limit)) {
      return RollbackTier.L4_HARD_GATE;
    }

    // Check L1 (manual kill)
    if (await this.checkL1(component)) {
      return RollbackTier.L1_KILL_SWITCH;
    }

    // Check L2 (feature flag)
    if (await this.checkL2(component)) {
      return RollbackTier.L2_FEATURE_FLAG;
    }

    // Check L3 (circuit breaker)
    if (await this.checkL3(component, metrics)) {
      return RollbackTier.L3_CIRCUIT_BREAKER;
    }

    // Check L0 (observability only)
    await this.checkL0(component, metrics);

    return null;
  }

  async resolve(component: RollbackComponent): Promise<void> {
    this.states.delete(component);
    await this.redis.hdel('rollback:active', component);
  }

  getActiveRollbacks(): RollbackState[] {
    return Array.from(this.states.values());
  }

  // Component-specific handlers
  private async executeHalt(component: RollbackComponent): Promise<void> {
    switch (component) {
      case RollbackComponent.SHARDING:
        // Set shard manager to single-shard mode
        await this.redis.set('shard:mode', 'single');
        break;
      case RollbackComponent.MULTI_REGION:
        // Route all traffic to us-east only
        await this.redis.set('region:routing:mode', 'static:us-east');
        break;
      case RollbackComponent.MODEL_TIERING:
        // Force all agents to Haiku
        await this.redis.set('model:tier:override', 'haiku');
        break;
      case RollbackComponent.CONNECTION_POOL:
        // Disable pooling, direct fetch with limit
        await this.redis.set('pool:mode', 'direct');
        break;
    }
  }

  private isDegraded(component: RollbackComponent, metrics: ComponentMetrics): boolean {
    switch (component) {
      case RollbackComponent.SHARDING:
        return metrics.errorRate > this.thresholds.shardErrorRate;
      case RollbackComponent.MULTI_REGION:
        return metrics.latencyP95 > this.thresholds.regionLatencyP95;
      case RollbackComponent.MODEL_TIERING:
        return metrics.timeoutRate > this.thresholds.modelTimeoutRate;
      case RollbackComponent.CONNECTION_POOL:
        return metrics.queueDepth > this.thresholds.queueDepth;
      default:
        return false;
    }
  }

  private getDegradationReason(component: RollbackComponent, metrics: ComponentMetrics): string {
    switch (component) {
      case RollbackComponent.SHARDING:
        return `Error rate ${(metrics.errorRate * 100).toFixed(1)}% > ${(this.thresholds.shardErrorRate * 100).toFixed(1)}%`;
      case RollbackComponent.MULTI_REGION:
        return `p95 latency ${metrics.latencyP95}ms > ${this.thresholds.regionLatencyP95}ms`;
      case RollbackComponent.MODEL_TIERING:
        return `Timeout rate ${(metrics.timeoutRate * 100).toFixed(1)}% > ${(this.thresholds.modelTimeoutRate * 100).toFixed(1)}%`;
      case RollbackComponent.CONNECTION_POOL:
        return `Queue depth ${metrics.queueDepth} > ${this.thresholds.queueDepth}`;
      default:
        return 'Unknown degradation';
    }
  }

  private async queueReviewTask(component: RollbackComponent, metrics: ComponentMetrics): Promise<void> {
    // Queue to admin review system (reuse existing)
    await this.redis.lpush('admin:review:queue', JSON.stringify({
      type: 'rollback_l0',
      component,
      metrics,
      timestamp: Date.now(),
    }));
  }

  private async alert(severity: string, message: string): Promise<void> {
    // Send to Telegram via existing alert system
    await telegramSend(`[${severity}] ${message}`);
  }

  async checkL1(component: RollbackComponent): Promise<boolean> {
    const active = await this.redis.hgetall('rollback:active');
    const state = active[component];
    if (state) {
      const parsed = JSON.parse(state);
      return parsed.tier === RollbackTier.L1_KILL_SWITCH;
    }
    return false;
  }
}

// Metrics interface
interface ComponentMetrics {
  errorRate: number;
  latencyP95?: number;
  timeoutRate?: number;
  queueDepth?: number;
  memoryUtilization?: number;
  [key: string]: any;
}

export const rollbackController = new TieredRollbackController(process.env.REDIS_URL!);
```

### Step 2: Integrate Rollback into Sharding

**File to modify:** `src/durable-objects/shard-manager.ts`

```typescript
import { rollbackController, RollbackComponent } from '../rollback/tiered-rollback-controller';

class ShardManager {
  async fetch(request: Request): Promise<Response> {
    // Check rollback status before processing
    const metrics = await this.collectMetrics();
    const rollbackTier = await rollbackController.evaluate(
      RollbackComponent.SHARDING,
      metrics,
      { value: metrics.shardCount, limit: 12 } // L4: max 12 shards
    );

    if (rollbackTier) {
      return this.handleRollback(rollbackTier);
    }

    // Normal processing
    return this.routeToShard(request);
  }

  private async handleRollback(tier: RollbackTier): Promise<Response> {
    switch (tier) {
      case RollbackTier.L1_KILL_SWITCH:
      case RollbackTier.L4_HARD_GATE:
        // Single shard mode
        return Response.json({ shard: 0, mode: 'single-shard' });
      case RollbackTier.L3_CIRCUIT_BREAKER:
        // Degraded: reduce strategy load
        return Response.json({ shard: 0, mode: 'degraded', strategies: 2 });
      default:
        return Response.json({ error: 'Degraded' }, { status: 503 });
    }
  }

  private async collectMetrics(): Promise<ComponentMetrics> {
    const shards = await this.getAllShardHealth();
    const totalErrors = shards.reduce((sum, s) => sum + s.errors, 0);
    const totalRequests = shards.reduce((sum, s) => sum + s.requests, 0);

    return {
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      shardCount: shards.length,
      avgLatency: shards.reduce((sum, s) => sum + s.avgLatency, 0) / shards.length,
    };
  }
}
```

### Step 3: Multi-Region Rollback Integration

**File to modify:** `src/regions/dynamic-router.ts`

```typescript
import { rollbackController, RollbackComponent } from '../rollback/tiered-rollback-controller';

class DynamicRegionRouter {
  async routeRequest(clientId: string, request: Request): Promise<string> {
    const regionMetrics = await this.collectRegionMetrics();

    const rollbackTier = await rollbackController.evaluate(
      RollbackComponent.MULTI_REGION,
      regionMetrics,
      { value: regionMetrics.unhealthyRegions, limit: 2 } // L4: if 2+ regions down
    );

    if (rollbackTier) {
      // Route everything to us-east (primary)
      return 'us-east';
    }

    // Normal routing logic
    return await this.selectBestRegion();
  }

  private async collectRegionMetrics(): Promise<ComponentMetrics> {
    const health = this.getHealthReport();
    const healthy = health.filter(h => h.healthy);

    return {
      errorRate: 1 - (healthy.length / health.length),
      latencyP95: Math.max(...health.map(h => h.latencyMs)),
      unhealthyRegions: health.filter(h => !h.healthy).length,
    };
  }
}
```

### Step 4: Model Tiering Rollback

**File to modify:** `src/agents/model-tier-dispatcher.ts`

```typescript
import { rollbackController, RollbackComponent } from '../rollback/tiered-rollback-controller';

class ModelTierDispatcher {
  async execute(agentName: string, input: any): Promise<AgentResult | JobResult> {
    const config = this.configs.get(agentName);
    if (!config) throw new Error(`Unknown agent: ${agentName}`);

    // Check rollback
    const metrics = await this.collectMetrics();
    const rollbackTier = await rollbackController.evaluate(
      RollbackComponent.MODEL_TIERING,
      metrics,
      { value: metrics.timeoutCount, limit: 100 } // L4: too many timeouts
    );

    if (rollbackTier) {
      // Force Haiku (Tier 1) for all agents
      return await this.executeHaikuFallback(agentName, input);
    }

    // Normal execution
    return this.executeByTier(agentName, input, config);
  }

  private async executeHaikuFallback(agentName: string, input: any): Promise<AgentResult> {
    logger.warn(`[Rollback] Executing ${agentName} in Haiku-only mode`);
    // Override config to use Haiku
    const haikuConfig = { ...this.configs.get(agentName), tier: ModelTier.TIER1_HAIKU };
    return this.executeTier1(agentName, input, haikuConfig);
  }

  private async collectMetrics(): Promise<ComponentMetrics> {
    // Collect from Prometheus or internal counters
    const timeoutCount = await redis.get('agent:timeout:count') || 0;
    const totalCalls = await redis.get('agent:total:count') || 1;

    return {
      timeoutRate: Number(timeoutCount) / Number(totalCalls),
      errorRate: 0, // TODO
    };
  }
}
```

### Step 5: Connection Pool Rollback

**File to modify:** `src/workers/connection-pool.ts`

```typescript
import { rollbackController, RollbackComponent } from '../rollback/tiered-rollback-controller';

class ConnectionPoolManager {
  async fetchWithPool(service: string, url: string, options: RequestInit): Promise<Response> {
    const metrics = await this.collectMetrics(service);
    const rollbackTier = await rollbackController.evaluate(
      RollbackComponent.CONNECTION_POOL,
      metrics,
      { value: metrics.waitQueueLength, limit: 100 }
    );

    if (rollbackTier) {
      // Fallback to direct fetch (bypass pool)
      logger.warn(`[Rollback] ${service}: Direct fetch (pool degraded)`);
      return fetch(url, options);
    }

    // Normal pool fetch
    return this.pool.fetch(service, url, options);
  }

  private async collectMetrics(service: string): Promise<ComponentMetrics> {
    const pool = this.pools.get(service);
    if (!pool) return { errorRate: 1, queueDepth: 0 };

    return {
      errorRate: pool.errorCount / Math.max(1, pool.requestCount),
      queueDepth: pool.waitQueueLength,
      activeConnections: pool.activeConnections,
    };
  }
}
```

### Step 6: Admin Kill Switch API

**File to create/modify:** `src/api/routes/admin-rollback-routes.ts`

```typescript
import { Router } from 'express';
import { rollbackController, RollbackComponent, RollbackTier } from '../../rollback/tiered-rollback-controller';

const router = Router();

// Trigger L1 kill switch
router.post('/admin/rollback/kill/:component', async (req, res) => {
  const { component } = req.params;
  const { reason } = req.body;

  if (!Object.values(RollbackComponent).includes(component)) {
    return res.status(400).json({ error: 'Invalid component' });
  }

  // Require admin auth
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin required' });
  }

  await rollbackController.triggerL1(component, reason || 'Manual kill switch');

  await auditLog({
    action: 'rollback_kill',
    component,
    user: req.user.id,
    reason,
  });

  res.json({ success: true, component, tier: 'L1' });
});

// Resolve rollback
router.post('/admin/rollback/resolve/:component', async (req, res) => {
  const { component } = req.params;

  await rollbackController.resolve(component);

  await auditLog({
    action: 'rollback_resolve',
    component,
    user: req.user?.id,
  });

  res.json({ success: true });
});

// Get active rollbacks
router.get('/admin/rollback/active', async (req, res) => {
  const active = rollbackController.getActiveRollbacks();
  res.json({ active, count: active.length });
});

// Force L4 hard gate (emergency limit change)
router.post('/admin/rollback/hard-gate/:component', async (req, res) => {
  const { component } = req.params;
  const { limit } = req.body;

  // Set hard limit in Redis
  await redis.hset('rollback:hard-gates', component, JSON.stringify({
    limit,
    setBy: req.user?.id,
    setAt: Date.now(),
  }));

  res.json({ success: true, component, limit });
});

export default router;
```

### Step 7: Add Grafana Alerts for Rollback Events

**File to modify:** `docker/grafana/provisioning/alerting/alert-rules.yml`

```yaml
groups:
  - name: rollback_alerts
    rules:
      - alert: RollbackL1Triggered
        expr: |
          rollback_active_tier{ tier="L1_KILL_SWITCH" } == 1
        for: 0m
        labels:
          severity: critical
          component: rollback
        annotations:
          summary: "L1 Kill switch activated for {{ $labels.component }}"
          description: "Immediate halt triggered - requires manual intervention"

      - alert: RollbackCircuitBreakerOpen
        expr: |
          rollback_active_tier{ tier="L3_CIRCUIT_BREAKER" } == 1
        for: 1m
        labels:
          severity: warning
          component: rollback
        annotations:
          summary: "Circuit breaker open for {{ $labels.component }}"
          description: "Auto-recovery in 5 minutes"

      - alert: MultiRegionDegraded
        expr: |
          region_healthy_count < 2
        for: 2m
        labels:
          severity: critical
          component: multi-region
        annotations:
          summary: "Multi-region degraded ({{ $value }} regions healthy)"
          runbook: "docs/runbooks/multi-region-outage.md"

      - alert: ShardHotspot
        expr: |
          max by (shard_id) (shard_requests_total - shard_errors_total) / 12 > 800
        for: 5m
        labels:
          severity: warning
          component: sharding
        annotations:
          summary: "Shard hotspot detected on {{ $labels.shard_id }}"
          runbook: "docs/runbooks/shard-rebalancing.md"

      - alert: MemoryPressureCritical
        expr: |
          memory_utilization_ratio > 0.9
        for: 2m
        labels:
          severity: critical
          component: memory
        annotations:
          summary: "Memory pressure critical ({{ $value }}% used)"
          runbook: "docs/runbooks/memory-pressure-response.md"
```

---

## Todo List

- [ ] Create `TieredRollbackController` with all 5 tiers
- [ ] Integrate rollback into ShardManager (L3/L4)
- [ ] Integrate rollback into DynamicRegionRouter (L3/L4)
- [ ] Integrate rollback into ModelTierDispatcher (L3/L4)
- [ ] Integrate rollback into ConnectionPoolManager (L3/L4)
- [ ] Create admin kill switch API endpoints
- [ ] Add Prometheus metrics for rollback events
- [ ] Create Grafana alerts for all rollback tiers
- [ ] Write runbook: `docs/runbooks/multi-region-outage.md`
- [ ] Write runbook: `docs/runbooks/shard-rebalancing.md`
- [ ] Write runbook: `docs/runbooks/memory-pressure-response.md`
- [ ] Write runbook: `docs/runbooks/llm-gateway-outage.md`
- [ ] Write runbook: `docs/runbooks/database-connection-exhaustion.md`
- [ ] Test each rollback tier in isolation
- [ ] Document rollback strategy in `docs/incident-response.md`

---

## Success Criteria

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| L3 auto-recovery time | <30s | Rollback event logs |
| L0 alert-to-task latency | <60s | Queue timing |
| False positive rate | <5% | Incorrect triggers / total |
| Rollback event logging | 100% | All events captured |

### Qualitative

- [ ] All 5 tiers implemented and tested
- [ ] Each component (sharding, region, model, pool) has rollback hooks
- [ ] Admin kill switch API functional and authenticated
- [ ] Grafana alerts configured for all critical rollback events
- [ ] 5 runbooks written for common rollback scenarios
- [ ] Manual rollback tested (<60s execution)
- [ ] Automated rollback (L3) tested with simulated failures
- [ ] Recovery procedures documented and validated

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Flapping (rapid trigger/recover) | Medium | Medium | Minimum hold time, debounce logic |
| Rollback cascade (multiple tiers) | Low | High | Single tier activation per component |
| Kill switch accidental trigger | Low | Critical | Require dual-approval for L1 |
| Auto-recovery too fast | Medium | Medium | Exponential backoff, max 3 retries |
| Metrics lag causing delayed response | Medium | Medium | Sub-second metric collection |

---

## Security Considerations

1. **Admin authentication**: All L1 kill switch requires admin auth
2. **Audit logging**: All rollback actions logged with user context
3. **Rate limiting**: Prevent rapid-fire rollback attempts
4. **Principle of least privilege**: Regular users cannot trigger rollback
5. **Evidence preservation**: Don't clear logs on rollback

---

## Files to Create/Modify

| File | Type | Purpose |
|------|------|---------|
| `src/rollback/tiered-rollback-controller.ts` | New | Central rollback logic |
| `src/durable-objects/shard-manager.ts` | Modify | L3/L4 integration |
| `src/regions/dynamic-router.ts` | Modify | L3/L4 integration |
| `src/agents/model-tier-dispatcher.ts` | Modify | L3/L4 integration |
| `src/workers/connection-pool.ts` | Modify | L3/L4 integration |
| `src/api/routes/admin-rollback-routes.ts` | New | Admin API |
| `docker/grafana/provisioning/alerting/alert-rules.yml` | Modify | Add rollback alerts |
| `docs/runbooks/multi-region-outage.md` | New | Failover runbook |
| `docs/runbooks/shard-rebalancing.md` | New | Shard ops |
| `docs/runbooks/memory-pressure-response.md` | New | Memory ops |
| `docs/runbooks/llm-gateway-outage.md` | New | LLM outage |
| `docs/runbooks/database-connection-exhaustion.md` | New | DB ops |

---

## Rollback Testing Plan

1. **L3 Circuit Breaker**: Inject errors, verify auto-trigger, verify auto-recovery after 5min
2. **L4 Hard Gate**: Set limit, verify blocking, verify release on config change
3. **L1 Kill Switch**: API call, verify immediate halt, verify manual resume
4. **Cross-tier precedence**: L1 overrides all others, verify priority order
5. **State persistence**: Redis survives restart, verify rollback state preserved

---

**Definition of Done:** All 5 rollback tiers implemented and integrated across sharding/multi-region/model-tiering/connection-pool, admin API functional with auth, all Grafana alerts configured, 5 runbooks complete, rollback tests passing, documentation updated.
