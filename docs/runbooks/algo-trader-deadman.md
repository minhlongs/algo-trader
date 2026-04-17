# Runbook: algo-trader Deadman (L0)

**Alert:** `AlgoTraderDeadman` — Grafana → Telegram admin channel.
**Metric:** `up{job="algo-trader"} == 0` for ≥3m (or NoData).
**Severity:** CRITICAL.

## What happened
Prometheus has been unable to scrape `algo-trade:3000/metrics` for 3+ minutes. Either the backend process died, the container crashed/OOM'd, the network path between Prometheus and the app broke, or the target was removed from the scrape config. All Qwen L-tier alerts are currently **blind** — any drawdown or signals-loop errors occurring right now will not page.

> **Naming note:** `algo-trader` (hyphenated) is the Prometheus `job_name` label in alert queries; `algo-trade` (no `r`) is the docker-compose service name. Don't confuse the two at 3am.

## Immediate actions (first 5 min)
1. **Check container health**:
   ```bash
   docker ps --filter name=algo-trade
   docker logs algo-trade --tail 200
   ```
2. **Manual metrics probe** (bypass Prometheus):
   ```bash
   curl -fsS http://localhost:3000/metrics | head -20
   ```
3. **Check Prometheus targets page** — Grafana → Explore → Prometheus → `up{job="algo-trader"}`. Confirm last successful scrape timestamp.
4. **If container healthy but scrape fails**: check `docker/prometheus/prometheus.yml` — target name drift from `algo-trade:3000`?

## Root cause analysis
Common drivers:
- **App crash**: unhandled rejection, DB connection exhausted, memory leak.
- **Container OOM**: M1 Max memory pressure — check Activity Monitor / `docker stats`.
- **Port conflict**: another process grabbed :3000.
- **Scrape config drift**: someone renamed the service in docker-compose without updating prometheus.yml.

## Remediation
- **If crashed**: restart via `docker compose -f docker-compose.yml up -d algo-trade`. Tail logs for 5m to confirm stability.
- **If OOM**: increase container memory limit, or investigate leak (`node --inspect` + heap snapshot).
- **If scrape config**: fix `prometheus.yml` target, reload prom (`curl -X POST http://localhost:9090/-/reload`).
- **If cold boot**: validate all 5 CI gates passed on last deploy — gate 4 (quality) would have flagged missing `/metrics`.

## Post-incident
- [ ] Verify `up{job="algo-trader"} == 1` for ≥5m continuous before closing.
- [ ] Confirm Qwen L-tier alerts are receiving data again (Grafana dashboard).
- [ ] If outage >30m, log entry to journal with root cause.
- [ ] If 2nd deadman in a week → escalate to founder + add freshness probe PR.

## Escalation
L0 is the floor — if this fires, observability itself is compromised. Operator must stop any deploys and fix before any L1–L4 decisions can be trusted.
