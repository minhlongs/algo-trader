# OmniRoute Patterns for Algo-Trader Go-Live Reliability

Source: https://github.com/diegosouzapw/OmniRoute

---

## Pattern 1: Three-Layer Circuit Breaker Architecture (High Impact)

**OmniRoute implementation:**
- Layer 1 — Provider circuit breaker: trips on 408/5xx, thresholds vary by auth type (OAuth 10×, API-key 15×, local 2×), resets 60s/30s/15s into HALF-OPEN probe
- Layer 2 — Connection cooldown: base 5s/3s backoff with exponential ×2, anti-thundering-herd guard, honors 429 Retry-After
- Layer 3 — Model lockout: per-model 429/404/mode denials lock just that model — never the whole connection

**Algo-trader application:**
```typescript
// Replace single health check with three-layer venue protection
interface VenueCircuitBreaker {
  // Layer 1: Venue-level (API gateway / exchange)
  venue: CircuitBreaker<VenueError>;        // trips on 5xx, timeout, connection reset
  
  // Layer 2: Connection-level (WebSocket / REST session)
  connection: ConnectionCooldown;           // exponential backoff, 429 handling
  
  // Layer 3: Symbol/strategy-level (per-market isolation)
  symbolLockout: Map<string, ModelLockout>; // per-symbol 429/404 isolation
}
```
**Why it improves reliability:** Current algo-trader has single `/health` endpoint. A Polymarket API 5xx cascades to all strategies. Three layers isolate: venue down ≠ connection dead ≠ symbol blocked.

---

## Pattern 2: Live Multi-Factor Scoring Over Static Routing (High Impact)

**OmniRoute implementation:** Auto-combo engine scores candidates on 14 factors (health, quota, cost, latency, success rate, freshness, cache hits, reset windows) — replaces static priority config with live scoring. 19 strategies including `cost-optimized`, `headroom`, `reset-aware`, `cache-optimized`, `lkgp` (sticky to last successful).

**Algo-trader application:**
```typescript
// Replace static venue priority with live scoring
interface VenueScorer {
  score(venue: Venue, context: OrderContext): number;
  // Factors: fillRate * 0.3 + latencyMs * 0.2 + feeBps * 0.2 + queueDepth * 0.15 + quotaRemaining * 0.15
}

const strategies = {
  fillOptimized:  (v, c) => v.fillRate * 0.4 + v.latency * 0.3 + v.fee * 0.3,
  costOptimized:  (v, c) => v.fee * 0.5 + v.fillRate * 0.3 + v.latency * 0.2,
  headroom:       (v, c) => v.quotaRemaining / v.quotaLimit,  // most remaining quota
  sticky:         (v, c) => v.lastSuccess ? 1 : 0,             // LKGP equivalent
};
```
**Why it improves reliability:** Current trading-pipeline uses hardcoded venue order. Live scoring adapts to real-time conditions (spreads widen → route to tighter venue; quota exhaust → failover automatically).

---

## Pattern 3: Scoped Remote Access with Token-Based Control (Medium Impact)

**OmniRoute implementation:** `connect` / `contexts` / `tokens` with `read`/`write`/`admin` scopes. Process-spawning routes stay loopback-only. Remote mode uses scoped tokens — "your machine, your rules."

**Algo-trader application:**
```typescript
// Replace SSH key deploy with scoped deploy tokens
interface DeployToken {
  scope: 'read' | 'write' | 'admin';  // read=health, write=deploy, admin=rollback
  targets: string[];                  // ['cf-worker', 'vps-docker']
  ttl: number;                        // 1h default
  issuedAt: number;
}

// GH Actions uses write-scoped token; on-call uses admin for kill-switch
```
**Why it improves reliability:** Current SSH key gives full VPS access. Scoped tokens limit blast radius — CI gets deploy-only, on-call gets rollback-only, monitoring gets read-only.

---

## Quick Wins (Can Implement This Sprint)

| Pattern | File to Modify | Effort |
|---------|----------------|--------|
| Three-layer circuit breaker | `src/desk/polymarket/trading-pipeline.ts` | 2-3 days |
| Live venue scoring | `src/strategy/venue-router.ts` (new) | 3-4 days |
| Scoped deploy tokens | `.github/workflows/ci-cd.yml` + VPS `deploy-token.service` | 1-2 days |

---

## Unresolved Questions
- OmniRoute uses mDNS (`omnimbp.local`) for local LLM gateway — should algo-trader adopt mDNS for VPS service discovery?
- OmniRoute's 12-engine compression pipeline (89.2% token savings) — applicable to market data telemetry compression?