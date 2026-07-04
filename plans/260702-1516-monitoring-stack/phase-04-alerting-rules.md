---
phase: 4
title: "Alerting Rules"
status: pending
priority: P1
effort: "~1h"
dependencies: [1, 2]
---

# Phase 4: Alerting Rules

## Overview

Define Prometheus alerting rules for critical conditions: daily loss exceeded, circuit breaker open, high API latency, data gaps, and IPN failures.

## Related Code Files

- **Modify:** `config/prometheus.yml` — add `rule_files` reference
- **Create:** `config/prometheus-alerts.yml` — alert rule definitions

## Implementation Steps

### Step 1: Create config/prometheus-alerts.yml

```yaml
groups:
  - name: algo-trade-critical
    interval: 30s
    rules:
      - alert: DailyLossExceeded
        expr: daily_pnl_usd < -50  # -$50 threshold (adjust based on bankroll)
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'Daily loss exceeded threshold on {{ $labels.strategy }}'
          description: 'Daily P&L is {{ $value | humanize }} — trading may be halted'

      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'Circuit breaker is open'
          description: 'Trading circuit breaker has been triggered — investigate immediately'

      - alert: HighExchangeLatency
        expr: exchange_api_latency_seconds{quantile="0.99"} > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'High exchange API latency on {{ $labels.exchange }}'
          description: 'p99 latency is {{ $value | humanize }} — possible connectivity issue'

      - alert: DataGapDetected
        expr: rate(market_data_gap_events_total[5m]) > 0
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: 'Data gap detected on {{ $labels.exchange }}'
          description: 'Data gap events detected for {{ $labels.symbol }}'

      - alert: ProviderDown
        expr: market_data_provider_availability == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'Provider {{ $labels.exchange }} is DOWN'
          description: 'Provider {{ $labels.exchange }} has been unavailable for > 1 minute'

      - alert: HighProviderErrorRate
        expr: market_data_provider_error_rate > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'High error rate on {{ $labels.exchange }}'
          description: 'Error rate is {{ $value | humanizePercentage }}'

      - alert: HighHTTPErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'High HTTP 5xx error rate'
          description: 'Error rate is {{ $value | humanizePercentage }}'
```

### Step 2: Update config/prometheus.yml

Add rule_files reference:

```yaml
rule_files:
  - '/etc/prometheus/alerts.yml'
```

### Step 3: Validate alert rules

```bash
# Check promtool available in container
docker-compose exec prometheus promtool check rules /etc/prometheus/alerts.yml

# Or check via Prometheus UI
curl http://localhost:9090/api/v1/rules  # should list all rules
```

### Step 4: Configure alert thresholds for bankroll

Current thresholds:
- Daily loss: -$50 (adjust to 5% of bankroll)
- High latency: > 5s p99
- Data gap: any in 5min window
- Error rate: > 5% of HTTP requests

## Alert Routing

| Alert | Severity | Receiver | Notification |
|-------|----------|----------|--------------|
| DailyLossExceeded | CRITICAL | Telegram | Immediate DM |
| CircuitBreakerOpen | CRITICAL | Telegram | Immediate DM |
| ProviderDown | CRITICAL | Telegram | Immediate DM |
| HighExchangeLatency | WARNING | Telegram | Group notification |
| DataGapDetected | WARNING | Telegram | Group notification |
| HighHTTPErrorRate | WARNING | Telegram | Group notification |

## Success Criteria

- [ ] `config/prometheus-alerts.yml` — all 7 alert rules defined
- [ ] `config/prometheus.yml` references alerts file
- [ ] `promtool check rules` — no validation errors
- [ ] Prometheus loads alert rules (verify via API `/api/v1/rules`)

## Risk

- Daily loss threshold cần adjust theo bankroll thực tế. Mặc định -$50, nên config thành percentage
- Alert rules file path sai → Prometheus không load. Verify volume mount
