---
phase: 2
title: "Grafana Dashboards"
status: pending
priority: P1
effort: "~2h"
dependencies: [1]
---

# Phase 2: Grafana Dashboards

## Overview

Create 2 Grafana dashboard JSON files for the provisioning system. These dashboards will auto-load when Grafana starts.

## Dashboard 1: Live Trading

**File:** `grafana/dashboards/live-trading.json`

### Panels

| Panel | Metric | Type |
|-------|--------|------|
| Daily P&L | `daily_pnl_usd{strategy=~".*"}` | Time series (bar) |
| Cumulative P&L | `sum(daily_pnl_usd)` | Time series (line) |
| Open Positions | `open_positions_total` | Single stat (gauge) |
| Circuit Breaker | `circuit_breaker_state` | Single stat (0=OK, 1=HALT) |
| Win Rate | `win_rate_percent{strategy=~".*"}` | Time series |
| Strategy Status | `strategy_active` | Table per strategy |
| Trade Volume | `rate(trades_total[1h])` | Time series |
| Daily Loss Gauge | `daily_pnl_usd < -5% threshold` | Gauge (red zone) |

### Design Notes
- Use `grafana/grafana:latest` built-in panel types (time series, stat, gauge, table)
- Thời gian mặc định: last 24h, auto-refresh 30s
- Variables: `$strategy` (label_values from `strategy_active`)

## Dashboard 2: Platform Health

**File:** `grafana/dashboards/platform-health.json`

### Panels

| Panel | Metric | Type |
|-------|--------|------|
| HTTP Requests/s | `rate(http_requests_total[5m])` | Time series (line) |
| Error Rate | `rate(http_requests_total{status=~"5.."}[5m])` | Time series |
| API Latency p95 | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` | Time series |
| Exchange Latency | `exchange_api_latency_seconds` | Time series per exchange |
| Data Gaps | `rate(market_data_gap_events_total[1h])` | Single stat |
| Provider Health | `market_data_provider_health_score` | Gauge per provider |
| SLA Compliance | `rate(market_data_sla_compliance_total{compliant="false"}[24h])` | Single stat |

### Design Notes
- 2 rows: "API Performance" + "Market Data Health"
- Auto-refresh 60s

## Implementation Steps

### Step 1: Create dashboard JSON manually

Dashboard JSON format for provisioning:

```json
{
  "__inputs": [],
  "__requires": [
    { "type": "datasource", "id": "prometheus", "name": "Prometheus", "version": "1.0.0" },
    { "type": "grafana", "id": "grafana", "name": "Grafana", "version": "10.x" }
  ],
  "annotations": { "list": [] },
  "editable": true,
  "gnetId": null,
  "graphTooltip": 0,
  "id": null,
  "links": [],
  "panels": [
    {
      "title": "Daily P&L",
      "type": "timeseries",
      "datasource": { "type": "prometheus", "uid": "PBFA97CFB590B2093" },
      "targets": [
        {
          "expr": "daily_pnl_usd",
          "legendFormat": "{{strategy}}",
          "refId": "A"
        }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "usd",
          "color": { "mode": "palette-classic" }
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 }
    }
    // ... more panels following same pattern
  ],
  "schemaVersion": 39,
  "style": "dark",
  "tags": ["algo-trade", "live-trading"],
  "templating": {
    "list": [
      {
        "name": "strategy",
        "type": "query",
        "query": "label_values(strategy_active, strategy)",
        "refresh": 1,
        "includeAll": true,
        "multi": true
      }
    ]
  },
  "time": { "from": "now-24h", "to": "now" },
  "timepicker": {},
  "timezone": "browser",
  "title": "Live Trading",
  "version": 1
}
```

### Step 2: Create service script for dashboard management

Create `scripts/import-grafana-dashboards.sh` — helper to import dashboards via Grafana API (useful for manual import outside provisioning):

```bash
#!/usr/bin/env bash
# import-grafana-dashboards.sh — Import dashboards via Grafana API
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3001}"
API_KEY="${GRAFANA_API_KEY:-admin:admin}"

for f in grafana/dashboards/*.json; do
  name=$(basename "$f" .json)
  echo "Importing $name..."
  payload=$(jq "{dashboard: ., overwrite: true}" "$f")
  curl -s -X POST "$GRAFANA_URL/api/dashboards/db" \
    -H "Authorization: Basic $(echo -n "$API_KEY" | base64)" \
    -H "Content-Type: application/json" \
    -d "$payload" > /dev/null
done
echo "Done"
```

### Step 3: Verify dashboards load

```bash
docker-compose restart grafana
curl http://localhost:3001/api/search?query=Live%20Trading  # should return dashboard
curl http://localhost:3001/api/search?query=Platform%20Health  # should return dashboard
```

## Success Criteria

- [ ] `grafana/dashboards/live-trading.json` — valid JSON, loaded by Grafana
- [ ] `grafana/dashboards/platform-health.json` — valid JSON, loaded by Grafana
- [ ] Live Trading dashboard shows: P&L, positions, circuit breaker, win rate, strategy status
- [ ] Platform Health dashboard shows: HTTP, latency, error rate, market data health
- [ ] Strategy variable ($strategy) filters by available strategies
- [ ] Dashboards survive container restart

## Risk

- Dashboard JSON có lỗi syntax → Grafana không load. Mitigation: validate với `jq . file.json`
- Thiếu datasource UID → panels không query. Mitigation: verify datasource UID match
