# LLM Gateway Outage Response

**Severity:** P2 - Service Degradation (AI features impaired)  
**SLA:** Detect < 5min, Respond < 10min, Mitigate < 15min  
**On-call:** AI/ML Engineer, Platform SRE

---

## Detection

### Automated Alerts

- **Grafana Alert:** `agent_executions_total{result="timeout"} / agent_executions_total > 0.1` (10% timeout rate)
- **Error rate spike:** LLM API errors in worker logs: `rate limit`, `timeout`, `service unavailable`
- **Queue backlog:** `queue_depth{queue="llm-sonnet"} > 100` or `queue_depth{queue="llm-opus"} > 50`

### Manual Detection

```bash
# Check LLM-related metrics
curl -G "https://grafana.algo-trader.com/api/ds/query" \
  --data-urlencode "query=sum(rate(agent_executions_total{result=\"timeout\"}[5m]))"

# Check agent error logs
wrangler tail --since 10m | grep -i "llm\|anthropic\|openai" | grep -i error

# Test LLM connectivity from each region
for region in us-east eu-central ap-southeast; do
  echo "Testing $region..."
  curl -s -X POST "https://$region.algo-trader.workers.dev/api/v1/agents/test-connection" \
    -H "Content-Type: application/json" \
    -d '{"model": "haiku", "prompt": "test"}' | jq .
done
```

**Sample error logs:**
```
[ERROR] LLM request failed: Anthropic API error: rate_limit_exceeded (status 429)
[ERROR] LLM timeout after 30000ms for agent market-regime-detector
[ERROR] All LLM providers unavailable, falling back to cached responses
```

---

## Runbook Steps

### 1. Determine Scope (0-5 min)

```bash
# Check which models are affected
curl https://region.algo-trader.workers.dev/api/v1/llm/health | jq .

# Expected response
{
  "providers": {
    "anthropic": {
      "haiku": {"status": "healthy", "latency_ms": 150},
      "sonnet": {"status": "degraded", "latency_ms": 2500},
      "opus": {"status": "unavailable", "error": "rate_limit"}
    }
  }
}
```

**Scenarios:**

| Scenario | Impact | Action |
|----------|--------|--------|
| **Single model down** (e.g., Opus only) | Tier 3 decision-making impaired | Activate fallback cascade (Opus → Sonnet) |
| **Single region affected** | Only that region loses LLM | Region likely isolated; failover if needed |
| **All regions, all models** | Provider-wide outage | Force all agents to Haiku (T1) only |
| **Rate limiting** | 429 errors | Throttle requests, increase queue wait times |

### 2. Activate Fallback Mechanisms (5-15 min)

**Scenario A: Tier 3 (Opus) Down**

Tier 3 agents automatically fall back to Sonnet (configured in model tiering dispatcher).

```typescript
// src/agents/model-tier-dispatcher.ts (existing behavior)
if (tier === 'opus' && !this.isAvailable('opus')) {
  console.warn('Opus unavailable, falling back to Sonnet');
  return this.dispatchWithTier('sonnet', prompt, priority);
}
```

**Verify fallback:**
```bash
# Check that Tier 3 requests are now using Sonnet
curl https://region.algo-trader.workers.dev/api/v1/metrics/agent | jq '.'
# Should see: agent_executions_total{model="sonnet",from_tier="t3"} increasing
```

**Scenario B: Sonnet Degraded**

If Sonnet also slow/unavailable:

```bash
# Increase Sonnet queue depth temporarily
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/queues/sonnet/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "concurrency": 10,  // Reduce from 20 to 10
    "defaultJobOptions": { "removeOnComplete": 200 }
  }'
```

Allow longer queue wait times (30s → 60s) for Sonnet requests.

**Scenario C: All Models Down (Provider Outage)**

```bash
# Force all agents to Haiku (T1) only
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/llm/override \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "forced_tier": "haiku",
    "reason": "Anthropic API outage",
    "expires_in_seconds": 3600
  }'

# This sets Redis key: llm:tier:override=haiku
```

**Effect:**
- All LLM requests use Haiku only
- Tier 2/3 agents operate with reduced capability
- Monitor quality metrics for degradation

**Override persists until:**
- Manually cleared: `POST /api/v1/admin/llm/override/clear`
- Expires automatically after TTL
- LLM health returns to normal (automated checker clears)

### 3. Monitor During Outage (15+ min)

**Key Metrics:**
- `agent_executions_total{result="success"}` vs `result="timeout"`
- `queue_depth` for Sonnet/Opus queues
- `agent_latency_seconds` (should decrease after fallback)
- Error rate in worker logs

**Grafana Dashboard:** `llm-gateway-health`

**CLI Monitoring:**
```bash
# Watch agent success rate
watch -n 10 'curl -s "https://grafana.algo-trader.com/api/ds/query" \
  --data-urlencode "query=rate(agent_executions_total{result=\"success\"}[1m])" | jq .'

# Watch queue backlog
watch -n 10 'curl -s https://region.algo-trader.workers.dev/api/v1/queue/stats | jq .'
```

**User Communication:**
If quality degradation affects trading decisions:
- Post incident notice: status.algo-trader.com
- Notify customers via email/Telegram
- Adjust SLAs if necessary

### 4. Provider Communication (Parallel)

**If Anthropic API outage:**
- Check https://status.anthropic.com/
- Open support ticket if outage > 30min
- Monitor for updates/ETA

**Alternative providers:** Consider multi-provider redundancy

```bash
# Check if OpenAI backup configured
curl https://admin.algo-trader.workers.dev/api/v1/admin/llm/providers | jq .
```

If backup provider available, switch:
```bash
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/llm/primary-provider \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"provider": "openai"}'
```

### 5. Restore Normal Operations (After Provider Recovers)

```bash
# 1. Clear forced tier override (if set)
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/llm/override/clear \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. Verify all models healthy
curl https://region.algo-trader.workers.dev/api/v1/llm/health | jq .

# 3. Gradually increase tier 2/3 capacity
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/queues/sonnet/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"concurrency": 20}'  # Back to normal

# 4. Monitor quality metrics return to baseline
# Compare agent success rates before/after outage
```

**Post-recovery validation:**
```bash
# Check no residual overrides
redis-cli GET llm:tier:override
# Should return nil or empty

# Verify tier 3 agents using Opus again
curl https://grafana.algo-trader.com/api/ds/query \
  --data-urlencode "query=sum(agent_executions_total{model=\"opus\"}) by (tier)"
```

---

## Prevention

### Multi-Provider Redundancy

```typescript
// src/agents/multi-provider-dispatcher.ts
class MultiProviderDispatcher {
  async dispatch(prompt: string, tier: LLMTier): Promise<LLMResponse> {
    const providers = this.getProvidersForTier(tier);

    for (const provider of providers) {
      try {
        return await this.callProvider(provider, prompt, tier.timeout);
      } catch (error) {
        if (this.isRetryable(error)) {
          console.warn(`Provider ${provider} failed, trying next:`, error.message);
          continue;
        }
        throw error;
      }
    }

    throw new Error('All LLM providers unavailable');
  }

  getProvidersForTier(tier: LLMTier): Provider[] {
    const mapping: Record<LLMTier, Provider[]> = {
      haiku: ['anthropic-haiku', 'openai-gpt-4o-mini'],
      sonnet: ['anthropic-sonnet', 'openai-gpt-4o'],
      opus: ['anthropic-opus', 'openai-o1']  // Fallback chain
    };
    return mapping[tier];
  }
}
```

### Circuit Breaker

```typescript
// src/resilience/llm-circuit-breaker.ts
class LLMCircuitBreaker {
  private failureCount: Map<string, number> = new Map();
  private lastFailure: Map<string, number> = new Map();

  async callWithCircuitBreaker(
    provider: string,
    fn: () => Promise<any>
  ): Promise<any> {
    const state = this.getState(provider);

    if (state === 'OPEN') {
      const sinceLastFailure = Date.now() - (this.lastFailure.get(provider) || 0);
      if (sinceLastFailure > 60000) // 1min timeout
        this.setState(provider, 'HALF_OPEN');
      else
        throw new Error(`Circuit breaker OPEN for ${provider}`);
    }

    try {
      const result = await fn();
      this.onSuccess(provider);
      return result;
    } catch (error) {
      this.onFailure(provider);
      throw error;
    }
  }

  private getState(provider: string): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    const failures = this.failureCount.get(provider) || 0;
    return failures >= 5 ? 'OPEN' : 'CLOSED';
  }
}
```

### Rate Limiting & Queue Management

- **Per-provider rate limit tracking**
- **Exponential backoff on 429 errors**
- **Queue overflow protection:** Discard low-priority jobs when depth > 1000

---

## Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| 429 Rate limit | Check provider quota | Throttle requests, increase queue wait |
| 5xx errors | Provider status page | Wait for provider recovery, activate fallback |
| Timeouts | `agent_latency_seconds` metric | Increase timeout, reduce concurrency |
| All queues backing up | Check worker instance count | Scale out workers horizontally |
| Override not working | Check Redis key: `GET llm:tier:override` | Manually set key, restart workers |

---

## Cost Impact

During LLM outage with forced Haiku-only mode:
- Cost reduction: ~80% (Haiku $0.25 vs Opus $15 per 1K tokens)
- Quality impact: Tier 3 decisions may have lower accuracy
- Acceptable for short outages (< 1 hour)

---

## Related Documents

- `docs/scaling-architecture.md` - Model tiering design
- `docs/metrics-reference.md` - LLM metrics
- `docs/runbooks/memory-pressure-critical.md` - Related resource pressure
- `src/agents/model-tier-dispatcher.ts` - Implementation

---

**Last Tested:** 2026-06-16  
**Next Drill:** Simulate provider outage monthly
