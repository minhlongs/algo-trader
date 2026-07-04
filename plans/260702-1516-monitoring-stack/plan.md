---
title: "Tuần 2 — Full Monitoring Stack (Grafana + Prometheus + Alertmanager + Telegram)"
description: "Add Docker monitoring services, Grafana dashboards, wire live trading metrics, configure alerting rules, and integrate Telegram alerts"
status: in_progress (Phases 1-4 complete)
priority: P1
branch: "main"
tags: [monitoring, grafana, prometheus, alertmanager, telegram, docker, ops]
blockedBy: []
blocks: []
created: "2026-07-02T08:26:21.936Z"
createdBy: "ck:plan"
source: skill
sessionId: "sophia-ops-week2"
brainstorm: "../../reports/brainstorm-260702-1516-ops-readiness-week2.md"
---

# Tuần 2 — Full Monitoring Stack (Grafana + Prometheus + Alertmanager + Telegram)

## Overview

Live trading infra đã code xong, nhưng **zero monitoring**. Cần full stack: Docker containers (Grafana + Prometheus + Alertmanager), dashboards cho live trading metrics, alerting rules cho daily loss/circuit breaker/IPN failures, và Telegram integration.

Dependency: Go Live Tuần 1 (production deploy + IPN + live trading) đã hoàn thành hoặc đang chạy song song.

## Phases

| Phase | Name | Status | Deps |
|-------|------|--------|------|
| 1 | [Docker Monitoring Stack](./phase-01-docker-monitoring-stack.md) | ✅ Complete | — |
| 2 | [Grafana Dashboards](./phase-02-grafana-dashboards.md) | ✅ Complete | 1 |
| 3 | [Wire Live Trading Metrics](./phase-03-wire-live-trading-metrics.md) | ✅ Complete | — |
| 4 | [Alerting Rules](./phase-04-alerting-rules.md) | ✅ Complete | 1, 2 |
| 5 | [Telegram Integration](./phase-05-telegram-integration.md) | ⏳ User action needed | 4 |

## Dependencies

```
Phase 1 (Docker Stack) ──→ Phase 2 (Dashboards) ──→ Phase 4 (Alerting) ──→ Phase 5 (Telegram)
                                                              ↑
Phase 3 (Wire Metrics) ──────────────────────────────────────┘
```

Phases 1 + 3 chạy song song. 2, 4, 5 nối tiếp.

## Key Decisions (from brainstorm)

- **Docker stack:** Grafana + Prometheus + Alertmanager containers trong docker-compose.yml
- **Grafana dashboards:** 2 dashboard JSON — Live Trading + Platform Health
- **Wire metrics:** Thêm Prometheus recorder calls vào 3 file live execution
- **Alerting:** Prometheus alert rules → Alertmanager → Telegram webhook
- **Periodic reports:** Dùng `trading-alerts.ts` code đã có cho P&L summary

## Success Criteria

- [ ] `docker-compose up -d grafana prometheus alertmanager` — all containers healthy
- [ ] Prometheus scrapes `/metrics` from algo-trade (target UP)
- [ ] Live Trading dashboard: P&L, positions, guard state, circuit breaker
- [ ] Platform Health dashboard: HTTP, latency, error rate, market data
- [ ] Live trading metrics được record: trades_total, daily_pnl_usd, circuit_breaker_state
- [ ] Daily loss > 5% → Telegram alert
- [ ] Circuit breaker trip → Telegram alert
- [ ] `pnpm typecheck` — 0 errors (sau khi wire metrics)
- [ ] `pnpm test` — 2,798+ tests pass

## Risk

- Grafana default port 3000 conflicts với app port 3000. Mitigation: map Grafana → 3001
- Dashboard provisioning lỗi → không load. Mitigation: verify volume paths
- metrics imports sai path. Mitigation: typecheck trước
