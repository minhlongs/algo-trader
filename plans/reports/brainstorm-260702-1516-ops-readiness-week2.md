# Brainstorm Report: Tuần 2 — Ops Readiness (Monitoring Stack)

**Date:** 2026-07-02 15:16 | **Mode:** --deep --parallel
**Status:** design complete | **Handoff target:** /ck:plan

## Problem Statement

Live trading infra đã code xong, nhưng **zero monitoring**. Khi có real capital, cần biết: P&L real-time?, strategy nào đang chạy?, circuit breaker có bị trip không?, daily loss limit có gần ngưỡng không? Hiện tại: Grafana dashboards trống, alerting chưa có, metrics chưa wire vào live pipeline.

## Sub-Projects

| # | Sub-Project | Effort | Deps |
|---|-------------|--------|------|
| A | Docker monitoring stack (Grafana + Prometheus + Alertmanager) | ~1h | Docker infra |
| B | Grafana dashboards (Live Trading + Platform Health) | ~2h | A |
| C | Wire live trading metrics vào Prometheus | ~1.5h | — |
| D | Alerting rules (daily loss, circuit breaker, IPN) | ~1h | A, B |
| E | Telegram integration cho alerts | ~1h | D |

## Evaluated Approaches

### Docker Stack (A)

**Option: Add monitoring services to docker-compose.yml**

- Grafana: `grafana/grafana:latest` với provisioning volume
- Prometheus: `prom/prometheus:latest` với scrape config pointing to `algo-trade:3000/metrics`
- Alertmanager: `prom/alertmanager:latest` với Telegram webhook receiver

**Volumes needed:**
- `./grafana/dashboards/` → dashboard JSON files
- `./grafana/provisioning/` → datasources + dashboard providers
- `./config/prometheus.yml` → scrape + alert rules
- `./config/alertmanager.yml` → notification routing

### Dashboards (B)

**Live Trading Dashboard:**
- P&L (daily, cumulative) — time series
- Open positions — table (token, side, size, entry, current, P&L)
- Guard status (position size, daily drawdown, circuit breaker, concurrent)
- Daily loss gauge (threshold: 5%)
- Circuit breaker state (0/1)
- Strategy active/inactive per strategy

**Platform Health Dashboard:**
- HTTP requests per second
- Error rate by status code
- API latency p95
- /metrics endpoint availability
- IPN verification success rate
- Exchange API latency
- Market data health (gap events, provider health)

### Wire Metrics (C)

Hiện tại `live-execution-guard.ts`, `live-position-tracker.ts`, `live-trading-orchestrator.ts` **không gọi Prometheus metrics**. Cần thêm:

- `recordTrade()`, `dailyPnlUsd`, `winRatePercent` trong `live-position-tracker.ts`
- `circuitBreakerState`, `openPositionsTotal` trong `live-execution-guard.ts`
- `strategyActive` trong `live-trading-orchestrator.ts`

### Alerting Rules (D)

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Daily loss exceeded | daily_pnl_usd < -5% bankroll | CRITICAL | Telegram DM + disable live |
| Circuit breaker open | circuit_breaker_state == 1 | CRITICAL | Telegram DM |
| High exchange latency | exchange_api_latency > 5s (p99) | WARNING | Telegram notify |
| Data gap detected | market_data_gap_duration > 60s | WARNING | Telegram notify |
| IPN verification fails | IPN metric fails > 3 in 5min | WARNING | Telegram notify |

### Telegram Integration (E)

Có 2 cách:
1. **Via Alertmanager webhook** — Alertmanager gửi HTTP POST → Telegram Bot API. Pros: tách biệt, không cần code. Cons: cần cấu hình webhook receiver.
2. **Via trading-alerts.ts** — Dùng code đã có, thêm subscription vào live trading events. Pros: code đã viết sẵn. Cons: cần thêm logic gọi.

**Recommendation:** Cách 1 cho CRITICAL alerts (Alertmanager → Telegram), cách 2 cho periodic P&L reports (trading-alerts.ts đã có `startPeriodicPnlReport`)

## Dependencies

```
A: Docker Stack ──→ B: Dashboards ──→ D: Alerting ──→ E: Telegram
                                              ↑
C: Wire Metrics ──────────────────────────────┘
```

A + C có thể chạy song song. B, D, E nối tiếp.

## Success Criteria

- [ ] `docker-compose up -d grafana prometheus alertmanager` — all containers healthy
- [ ] Prometheus scrapes `/metrics` from algo-trade — target UP
- [ ] Grafana dashboards hiển thị: P&L, positions, guard state, circuit breaker
- [ ] Live trading metrics được record: trades_total, daily_pnl_usd, circuit_breaker_state
- [ ] Daily loss > 5% → Telegram alert nhận được
- [ ] Circuit breaker trip → Telegram alert
- [ ] Periodic P&L report gửi Telegram mỗi 6h

## Risk

- Grafana provisioning lỗi → dashboard không load. Mitigation: kiểm tra volume paths
- Metrics wire thay đổi code cần typecheck + test. Mitigation: chạy `pnpm typecheck`
- Docker compose conflict với ports Grafana mặc định (3000 vs app 3000). Mitigation: map Grafana port 3001

## Out of Scope

- Phân tích performance deep-dive
- Custom Grafana plugins
- Retention policy tuning
- Multi-cluster monitoring

## Files to Touch

| File | Action |
|------|--------|
| `docker-compose.yml` | EDIT — add grafana, prometheus, alertmanager services |
| `grafana/dashboards/live-trading.json` | NEW — Live Trading dashboard |
| `grafana/dashboards/platform-health.json` | NEW — Platform Health dashboard |
| `grafana/provisioning/datasources/prometheus.yml` | NEW — Prometheus datasource |
| `grafana/provisioning/dashboards/default.yml` | NEW — Dashboard provider |
| `config/prometheus.yml` | NEW — Scrape config + alert rules |
| `config/alertmanager.yml` | NEW — Notification routing + Telegram |
| `src/desk/execution/live-execution-guard.ts` | MODIFY — wire Prometheus metrics |
| `src/desk/execution/live-position-tracker.ts` | MODIFY — wire trade/P&L metrics |
| `src/desk/polymarket/live-trading-orchestrator.ts` | MODIFY — wire strategy active metric |

## Next

Hand off to `/ck:plan` for detailed phases.
