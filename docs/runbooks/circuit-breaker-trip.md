# Incident Response Runbook: Circuit Breaker Trips

**Severity:** P2 (High)  
**SLA:** Detection < 1m, Response < 2m, Resolution < 5m  
**Owner:** SRE Team  
**Last Updated:** 2026-06-16

---

## Scenario

Circuit breaker pattern has triggered for one or more downstream services (LLM APIs, external data providers). This prevents requests from reaching the failing service, causing degraded functionality (e.g., agent analysis reduced quality, market data delays). The circuit breaker enters `OPEN` state after consecutive failures.

---

## Detection

### Automated Alerts

1. **Circuit Breaker Open**
   - Query: `circuit_breaker_state{state="open"} == 1`
   - Threshold: Any breaker in `open` state
   - Notification: Slack #alerts, PagerDuty P2

2. **High Failure Rate**
   - Query: `rate(circuit_breaker_failures_total[5m]) > 10`
   - Threshold: > 10 failures/min
   - Notification: Slack #alerts

3. **Degraded Service**
   - Query: `rate(http_requests_total{endpoint="/api/v1/agents/.*/analyze",status="206"}[5m]) > 0`
   - Threshold: > 5% degraded (206 Partial Content instead of 200)
   - Notification: Slack #alerts

### Manual Detection

```bash
# Check circuit breaker states
curl -s https://us-east.algo-trader.com/api/admin/circuit-breakers | jq '.[] | {name, state, failures, lastFailure}'

# Or via Grafana dashboard:
# Circuit Breaker Status panel → shows all breakers with state and failure count

# Check for degraded responses (206 instead of 200)
curl -s https://us-east.algo-trader.com/api/status | jq '.circuitBreakers'
```

---

## Response Steps (0-2 minutes)

### 1. Acknowledge

```bash
# Accept PagerDuty
# Post to #incidents:
"Circuit breaker OPEN for service: anthropic-api
Fallback mode active. Investigating root cause.
Impact: Agent analysis may be degraded or skip LLM analysis."
```

### 2. Identify Affected Service

```bash
# List all tripped breakers
curl -s https://us-east.algo-trader.com/api/admin/circuit-breakers | jq '.[] | select(.state=="open")'

# Check failure logs
cloudflared logs --since 10m | grep "CircuitBreaker" | grep "opened"

# Typical services:
# - anthropic-api (LLM provider)
# - polymarket-api (trading data)
# - sentry (error tracking)
# - slack (notifications)
```

**Decision:** Is this one service or multiple?

- **Single service** → likely external API issue
- **Multiple services** → possibly network partition or app bug

### 3. Verify Downstream Service Health

```bash
# Check LLM API health
curl -s -H "x-api-key: $ANTHROPIC_KEY" https://api.anthropic.com/v1/messages \
  -d '{"model":"claude-opus-4-8","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}' \
  | jq '.stop_reason'

# Check Polymarket API
curl -s https://clob.polymarket.com/orders?limit=1 | jq

# Check all external services
for url in $ANTHROPIC_URL $POLYMARKET_URL $SLACK_WEBHOOK; do
  echo "=== $url ==="
  curl -s -o /dev/null -w "%{http_code}" -m 5 $url || echo "TIMEOUT"
done
```

### 4. Manual Circuit Breaker Reset (if service recovered)

```bash
# Reset specific breaker
curl -X POST https://us-east.algo-trader.com/api/admin/circuit-breakers/anthropic-api/reset

# Or reset all breakers
curl -X POST https://us-east.algo-trader.com/api/admin/circuit-breakers/reset-all

# Verify state changed to CLOSED
curl -s https://us-east.algo-trader.com/api/admin/circuit-breakers | jq '.[] | {name, state}'
```

**Note:** Only reset if downstream service verified healthy. Otherwise breaker will immediately trip again.

---

## Root Cause Investigation (2-5 minutes)

### 5. Analyze Failure Pattern

```bash
# Get breaker metrics
curl -s https://prometheus.cloudflare.com/api/v1/query?query=circuit_breaker_failures_total | jq

# Check timeouts vs errors
cloudflared logs --since 30m | grep -E "(timeout|ECONNREFUSED|ETIMEDOUT|5..)" | head -20

# Check latency of failing calls
cloudflared metrics list --type latency | grep anthropic
```

**Diagnosis:**

| Symptom | Likely Cause |
|---------|--------------|
| Timeouts (no response) | Downstream slow or network issue |
| 5xx errors | Downstream service error |
| Connection refused | Downstream down or firewall |
| 429 rate limit | LLM quota exceeded |

### 6. Temporary Mitigation

**If LLM API slow/unavailable:**

```bash
# Switch to lighter/faster model
cloudflared secret put DEFAULT_LLM_MODEL --value "claude-haiku-4-5"

# Or disable LLM analysis (fallback to rules-based)
cloudflared secret put AGENT_LLM_ENABLED --value "false"
```

**If external data API down:**

```bash
# Enable cached data mode
cloudflared secret put MARKET_DATA_CACHE_TTL --value "300"  # 5 min cache
```

**Expected:** Circuit breaker closes automatically after fallback period (30s-2min).

### 7. Monitor Recovery

```bash
# Watch breaker state
watch -n 5 'curl -s https://api/admin/circuit-breakers | jq ".[] | {name, state, failures}"'

# State progression:
# OPEN → HALF_OPEN (after 30s) → CLOSED (if success) or OPEN (if failure)
```

---

## Resolution (5-15 minutes)

### 8. Permanent Fix

Depending on root cause:

**A. External API outage (no fix possible)**
- Wait for provider to recover
- Monitor status page: https://status.anthropic.com/, https://status.polymarket.com/
- Keep fallback mode enabled until stable

**B. Rate limiting/quota exceeded**
- Request quota increase from provider
- Add exponential backoff with jitter
- Implement request queuing to smooth spikes

**C. Network/firewall issue**
- Check Cloudflare connectivity
- Verify API key validity (not expired)
- Check IP whitelist (if configured)

**D. Application timeout too low**
- Increase timeout for slow service:
  ```typescript
  this.http.timeout = 30000;  // from 10000
  ```

**E. Connection pool exhaustion downstream**
- Increase pool size for that service
- Add connection pooling for external API (axios-agent)

### 9. Verify

```bash
# 1. Reset circuit breaker
curl -X POST https://api/admin/circuit-breakers/anthropic-api/reset

# 2. Trigger test request
curl -s https://us-east.algo-trader.com/api/v1/agents/test/analyze | jq

# 3. Check breaker state is CLOSED
curl -s https://api/admin/circuit-breakers | jq '.[] | select(.name=="anthropic-api")'

# 4. Verify no degradation
curl -s https://api/health | jq
```

### 10. Restore Normal Operation

```bash
# Revert temporary fallbacks
cloudflared secret put DEFAULT_LLM_MODEL --value "claude-opus-4-8"
cloudflared secret put AGENT_LLM_ENABLED --value "true"
cloudflared secret put MARKET_DATA_CACHE_TTL --value "60"
```

---

## Post-Mortem

```markdown
# Circuit Breaker Trip Post-Mortem

## Service Affected
<anthropic-api|polymarket-api|...>

## Timeline
- Breaker opened: <timestamp>
- Downtime: <duration>
- Service recovered: <timestamp>
- Breaker closed: <timestamp>

## Root Cause
<External API slow due to high load / Network partition / ...>

## Impact
- Agent analysis degraded: <X>% of requests
- Data freshness reduced: <Y> minutes stale
- User-visible impact: <description>

## Corrective Actions
1. [ ] Adjust circuit breaker thresholds (increase timeout or failure threshold)
2. [ ] Add multi-region LLM failover (due <date>)
3. [ ] Implement request caching layer (due <date>)

## Prevention
- Monitoring alerts now catch degradation before breaker trips
- Graceful degradation tested in load tests
- Fallback strategies documented
```

---

## Escalation

- Multiple breakers open simultaneously → P1 (likely infrastructure issue)
- Breaker stays open > 1 hour despite downstream healthy → P1
- No fallback implemented for critical path → escalate to CTO

---

## Related Documentation

- Circuit breaker pattern: `docs/circuit-breaker.md`
- Resilience patterns: `docs/resilience.md`
- LLM failover: `docs/llm-failover.md`

---

## Runbook Verification

Monthly:
1. Simulate downstream failure in staging
2. Verify breaker trips within threshold
3. Test automatic recovery when service restored
4. Validate fallback behavior
5. Review and adjust thresholds based on observed patterns
