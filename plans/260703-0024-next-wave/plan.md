---
title: "Next Wave: Revenue + Trading + Infra + Platform"
description: "Close critical revenue-blocking gaps, fix broken strategy wiring, harden infrastructure, and deepen the marketplace platform for the algo-trader RaaS."
status: pending
created: "2026-07-03"
branch: "main"
tags: ["revenue", "trading", "infrastructure", "platform", "marketplace"]
---

## Overview

Four scout reports (revenue, strategy, infra, platform) identified gaps that prevent the algo-trader platform from generating revenue at scale. This plan prioritizes fixes across 4 parallel tracks.

Each track is self-contained. Phases within a track are ordered, but tracks can run concurrently because they touch distinct files.

### Priority Legend

- **P0** — blocks revenue entirely or crashes the runtime
- **P1** — loses revenue or degrades operations significantly
- **P2** — missed growth opportunity, nice-to-have

### Complexity Legend

- **S** — < 1 hour, single file change
- **M** — 1-3 hours, a few files
- **L** — 3-8 hours, multiple modules
- **XL** — 1-3 days, cross-module work

---

## Track 1: Revenue Growth (5 items)

| # | Item | Priority | Complexity | Deps |
|---|------|----------|------------|------|
| 1.1 | Fix Signup: require payment before PRO/Enterprise activation | P0 | M | — |
| 1.2 | Fix Enterprise inquiry form tier gate (circular dep) | P0 | S | — |
| 1.3 | Verify IPN webhook route, add idempotency, add credential guards | P0 | M | — |
| 1.4 | Lower revenue API gate from ENTERPRISE to PRO | P1 | S | — |
| 1.5 | Add email notifications to dunning service | P1 | M | — |

## Track 2: Trading Edge (3 items)

| # | Item | Priority | Complexity | Deps |
|---|------|----------|------------|------|
| 2.1 | Replace 23 missing strategy factories in strategy-wiring.ts | P0 | L | — |
| 2.2 | Fix 3 missing strategy imports in trading-pipeline.ts | P0 | S | 2.1 |
| 2.3 | Add live mode switch with env-var validation for paper->live transition | P1 | S | — |

## Track 3: Infra Hardening (6 items)

| # | Item | Priority | Complexity | Deps |
|---|------|----------|------------|------|
| 3.1 | Redis: add persistence config + password in production compose | P0 | M | — |
| 3.2 | SSL/TLS: cert renewal script + Caddy reverse proxy | P1 | M | — |
| 3.3 | Load testing: fix k6 thresholds, CI integration, establish baseline | P1 | M | — |
| 3.4 | Alertmanager: configure notification channel | P2 | S | — |
| 3.5 | Docker: pin Prometheus/Grafana/Alertmanager versions in main compose | P2 | S | — |
| 3.6 | Prometheus: set retention in main compose | P2 | S | — |

## Track 4: Platform Depth (4 items)

| # | Item | Priority | Complexity | Deps |
|---|------|----------|------------|------|
| 4.1 | Self-service developer API key management UI + API | P1 | L | — |
| 4.2 | Real-time P&L streaming for marketplace subscribers | P2 | XL | — |
| 4.3 | Notification system: replace in-memory stub with real delivery | P2 | L | — |
| 4.4 | Community strategy sandbox: compile and execute uploaded strategies | P2 | XL | 2.1 |

---

## Dependency Graph

```
Track 1 (Revenue)                  Track 2 (Trading)            Track 3 (Infra)           Track 4 (Platform)
─────────────────────              ─────────────────            ────────────────           ─────────────────────
1.1 Signup Payment                2.1 Strategy Wiring          3.1 Redis Persistence      4.1 API Keys
1.2 Enterprise Gate               2.2 Pipeline Fix (←2.1)     3.2 SSL/TLS                4.2 P&L Streaming
1.3 IPN Verify                    2.3 Live Mode Env            3.3 Load Testing           4.3 Notifications
1.4 Revenue Gate                                          3.4 Alertmanager        4.4 Sandbox (←2.1)
1.5 Dunning Email                                         3.5 Docker Tags
                                                          3.6 Prom Retention
```

All tracks are independent — no cross-track dependencies except 4.4 (sandbox) which depends on 2.1 (strategy wiring).

---

## Success Criteria

- [ ] PRO/Enterprise signups go through NOWPayments checkout before license activation
- [ ] Enterprise inquiry form is accessible to non-authenticated users
- [ ] IPN webhook route processes payment callbacks with idempotency
- [ ] Revenue analytics accessible at PRO tier (MRR, churn, usage, overage)
- [ ] Customers receive email on payment failures and license suspension
- [ ] Strategy wiring file references only existing strategy modules (no MODULE_NOT_FOUND)
- [ ] Trading pipeline has no dead imports
- [ ] Live trading mode validated by env-var checks before execution
- [ ] Redis has persistence (appendonly + save) and password authentication
- [ ] SSL/TLS auto-renewal script exists
- [ ] k6 load test passes thresholds and runs in CI
- [ ] Alertmanager delivers alerts to at least one channel
- [ ] Docker monitoring uses pinned versions
- [ ] Prometheus retention configured in main compose
- [ ] Self-service API key management page exists
- [ ] Notification system delivers via real transport (not in-memory)

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Strategy wiring dead imports cause startup crash | Runtime failure | Fix P0 before any production restart |
| Redis without persistence loses rate-limit state on restart | Transient operational issue | Add persistence config (P0) |
| IPN route handler missing means paid subs never activate | Zero revenue from marketplace | Verify route exists before deploy (priority over new features) |
| Wrong tier gate on enterprise inquiry blocks all enterprise leads | Zero enterprise pipeline | Single-line fix (P0), highest impact per change ratio |
| Notification system stub causes customer frustration | Support volume | Start with simple email transport before streams |
