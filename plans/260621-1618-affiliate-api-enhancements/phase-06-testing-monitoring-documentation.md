# Phase 6: Testing, Monitoring & Documentation

**Priority**: P1 - Quality & Observability  
**Status**: Not Started  
**Effort**: 1.5 days  
**Dependencies**: Phase 5 (enhanced fraud) complete

---

## Context Links

- **Plan**: `plans/260621-1618-affiliate-api-enhancements/plan.md`
- **Existing tests**: `src/referral/__tests__/`, `src/api/routes/__tests__/`
- **Metrics**: `src/middleware/prometheus-metrics.ts`
- **Grafana**: `docker/grafana/dashboards/`

---

## Overview

Comprehensive testing (unit, integration, E2E, load), observability (Prometheus metrics, Grafana dashboard), and documentation (API reference, admin runbook, partner guide). Ensures reliability, performance, and smooth operation of the enhanced affiliate system.

---

## Key Insights

- **Test coverage**: Target ≥90% unit, 100% integration for new code
- **Load testing**: Critical for track-click (1000 RPS), reporting (100 RPS), WebSocket (500 connections)
- **Metrics**: Need visibility into attribution success rate, commission latency, fraud score distribution
- **Grafana dashboard**: Single pane of glass for affiliate program health
- **Documentation**: Partners need clear API docs; admins need fraud review runbook
- **CI/CD integration**: All tests must pass before merge to main

---

## Requirements

### Testing

**Unit tests** (≥90% coverage):
- CookieAttributionService: hash generation, DB ops, expiry checks
- CommissionWebSocketHandler: auth, subscription validation, message broadcasting
- ReportingService: caching, date validation, aggregations
- AffiliateApiKeyManager: key generation, hashing, validation
- Fraud signals: device fingerprint, proxy detection, email analysis, geo mismatch, self-referral
- Export generators: CSV streaming, JSON Lines format

**Integration tests** (100% pass):
- Full flow: track-click → cookie set → signup (within 90d) → conversion → commission → WS push
- Reporting: date range queries, time-series aggregation, export streaming
- Affiliate auth: key generation → use key → access endpoints → rotate → revoke
- Fraud detection: simulated bot attacks, manual override

**E2E tests** (Playwright):
- Landing page: click referral link → cookie set → navigate → signup
- Dashboard: affiliate key management UI → generate/revoke keys
- Dashboard: real-time commission updates appear automatically
- Fraud review: admin flags, overrides, bulk actions

**Load tests** (k6):
- Track-click: 1000 RPS for 60s (cookie set)
- Reporting: 100 RPS for 60s with 1M historical rows
- WebSocket: 500 concurrent connections, 100 commission events/sec
- Export: 50 concurrent CSV downloads of 100k rows

### Monitoring

**Prometheus metrics** (add to `src/middleware/prometheus-metrics.ts`):

```typescript
// Attribution
affiliate_cookies_set_total = new Counter({
  name: 'affiliate_cookies_set_total',
  help: 'Total affiliate cookies set',
});

affiliate_attributions_total = new Counter({
  name: 'affiliate_attributions_total',
  help: 'Conversions attributed via cookie',
  labelNames: ['attribution_window', 'within_window'], // <1d, <7d, <30d, <90d, expired
});

// Real-time
affiliate_ws_connections = new Gauge({
  name: 'affiliate_ws_connections',
  help: 'Active WebSocket connections for affiliate commissions',
});

commission_events_published_total = new Counter({
  name: 'commission_events_published_total',
  help: 'Commission events published to WebSocket',
  labelNames: ['event_type'], // created, updated
});

// Reporting
report_exports_total = new Counter({
  name: 'report_exports_total',
  help: 'Report exports generated',
  labelNames: ['format', 'type'], // csv, json / commissions, clicks, conversions
});

report_query_duration_seconds = new Histogram({
  name: 'report_query_duration_seconds',
  help: 'Report query execution time',
  labelNames: ['endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5],
});

// Affiliate auth
affiliate_auth_failures_total = new Counter({
  name: 'affiliate_auth_failures_total',
  help: 'Failed affiliate API key authentications',
  labelNames: ['reason'], // invalid_key, revoked, missing_header
});

affiliate_api_key_usage_total = new Counter({
  name: 'affiliate_api_key_usage_total',
  help: 'API calls made with affiliate keys',
  labelNames: ['key_id', 'tenant_id', 'endpoint'],
});

// Fraud
fraud_detection_score_bucket = new Histogram({
  name: 'fraud_detection_score_bucket',
  help: 'Fraud score distribution (0-100)',
  buckets: [0, 30, 60, 80, 100],
});

fraud_blocks_total = new Counter({
  name: 'fraud_blocks_total',
  help: 'Clicks blocked as fraudulent',
  labelNames: ['reason'], // proxy, disposable_email, self_referral, etc.
});
```

### Grafana Dashboard

Create `docker/grafana/dashboards/affiliate-program.json`:

**Panels**:
1. Attribution funnel (clicks → cookie set → conversions) - time series
2. Commission velocity (events/sec, last 24h) - graph
3. Fraud score distribution - histogram
4. Top affiliates by earnings - bar chart (last 30d)
5. WebSocket connections gauge
6. Export request rate (per minute)
7. Affiliate auth failures (rate)
8. API key usage (top 10 keys by requests)

**Alerts** (add to `docker/grafana/provisioning/alerting/affiliate-alerts.yml`):
- `AffiliateWsConnectionsHigh`: > 800 connections (warning), > 950 (critical)
- `FraudRateSpike`: fraud_blocks_total increased 50% WoW
- `AttributionRateDrop`: affiliate_cookies_set_total < 50% of 7-day average
- `ExportLatencyHigh`: report_query_duration_seconds{p95} > 2s

### Documentation

**API Reference** (`docs/api-reference.md` addition):
- All new endpoints: `/api/v1/referral/reports/*`, `/api/v1/affiliate/keys/*`
- Request/response examples
- Authentication: `X-Affiliate-API-Key` header format
- Rate limits: 1000 RPM for affiliate keys, 60 RPM for reporting
- Error codes: 400 (date range invalid), 401 (invalid key), 429 (rate limit)

**Admin Runbook** (`docs/runbooks/affiliate-fraud-review.md`):
- How to review flagged clicks
- Understanding fraud score breakdown
- Override process (when legitimate)
- Escalation to security team (suspected attack)
- Bulk approve/deny workflow

**Partner FAQ** (`docs/affiliate-partner-faq.md`):
- How do I get an affiliate API key?
- Why wasn't my conversion attributed? (cookie expiry, incognito, etc.)
- Why was my commission delayed? (fraud review, pending payout)
- How do I export my earnings?
- What counts as fraudulent activity?

---

## Implementation Steps

1. **Write unit tests** for all new modules:
   - `cookie-attribution.test.ts`
   - `commission-websocket.test.ts`
   - `reporting-service.test.ts`
   - `affiliate-api-key-manager.test.ts`
   - `fraud-detector-v2.test.ts` (all signals)
   - Run: `pnpm test --coverage` → ensure ≥90%

2. **Write integration tests**:
   - `referral-api-cookie-flow.test.ts`
   - `referral-reports-date-filter.test.ts`
   - `affiliate-auth-flow.test.ts`
   - `fraud-detection-integration.test.ts`
   - Run: `pnpm test tests/integration/`

3. **Write E2E tests** (Playwright):
   - `affiliate-landing-signup.spec.ts`
   - `affiliate-dashboard-real-time.spec.ts`
   - `admin-fraud-review.spec.ts`
   - Run: `pnpm test:e2e`

4. **Load testing** (k6):
   - Create `tests/load/affiliate-api-load-test.js`
   - Scenarios: track-click (1000 RPS), reports (100 RPS), WS (500 conn)
   - Run: `k6 run --vus 1000 --duration 60s tests/load/affiliate-api-load-test.js`
   - Analyze results: p95 < 500ms, error rate < 1%

5. **Add Prometheus metrics**:
   - Add all metric definitions to `src/middleware/prometheus-metrics.ts`
   - Instrument code: increment counters in handlers, observe histogram durations
   - Verify: `curl http://localhost:3000/metrics | grep affiliate_`

6. **Create Grafana dashboard**:
   - Import JSON into Grafana (http://localhost:3001)
   - Set time range to "Last 7 days"
   - Verify panels show data (may need to generate test traffic)
   - Set up alerts

7. **Write documentation**:
   - Update `docs/api-reference.md` with all new endpoints
   - Create `docs/runbooks/affiliate-fraud-review.md`
   - Create `docs/affiliate-partner-faq.md`
   - Update `README.md` with affiliate program section

8. **Deploy to staging**:
   - Run all migrations (025, 026, 027)
   - Deploy code
   - Seed test data: generate 100k clicks, 1k conversions
   - Run batch fraud job: `node -e "require('./src/referral/referral-service').runFraudDetection(100000)"`
   - Verify metrics: `curl http://staging:3000/metrics`
   - Load test staging endpoint

9. **Production rollout**:
   - Day 1: Deploy with feature flags: `ENABLE_COOKIE_ATTRIBUTION=true`, `ENABLE_REAL_TIME=true`, `ENABLE_REPORTING=true`, `ENABLE_AFFILIATE_AUTH=true`, `ENABLE_ENHANCED_FRAUD=true` (all flags true)
   - Monitor Grafana for 24h
   - Day 2: Enable affiliate auth in production
   - Day 3: Enable enhanced fraud (score-only mode)
   - Day 10: Enable auto-block for score ≥ 80 (if false positive rate < 2%)

10. **Partner communication**:
    - Email existing partners: "New affiliate API available"
    - Include API key generation instructions
    - Link to partner FAQ
    - Offer 1:1 onboarding for high-volume partners

---

## Related Code Files

**Testing**:
- `src/referral/__tests__/cookie-attribution.test.ts`
- `src/referral/__tests__/commission-websocket.test.ts`
- `src/referral/__tests__/reporting-service.test.ts`
- `src/billing/__tests__/affiliate-api-key-manager.test.ts`
- `src/referral/__tests__/fraud-detector-v2.test.ts`
- `tests/integration/referral-cookie-flow.test.ts`
- `tests/integration/referral-reports-date-filter.test.ts`
- `tests/integration/affiliate-auth-flow.test.ts`
- `tests/integration/fraud-detection-integration.test.ts`
- `dashboard/src/pages/__tests__/affiliate-dashboard.spec.ts`
- `tests/e2e/affiliate-*.spec.ts`

**Metrics**:
- `src/middleware/prometheus-metrics.ts` (add affiliate metrics)

**Dashboard**:
- `docker/grafana/dashboards/affiliate-program.json`
- `docker/grafana/provisioning/alerting/affiliate-alerts.yml`

**Docs**:
- `docs/api-reference.md` (update)
- `docs/runbooks/affiliate-fraud-review.md` (new)
- `docs/affiliate-partner-faq.md` (new)
- `README.md` (update affiliate section)

---

## Todo List

- [ ] Write unit tests (≥90% coverage on all new modules)
- [ ] Write integration tests (full flows)
- [ ] Write E2E tests (Playwright)
- [ ] Execute load tests (k6); verify performance SLAs
- [ ] Add Prometheus metrics instrumentation
- [ ] Create Grafana dashboard (import JSON)
- [ ] Set up Grafana alerts
- [ ] Write API documentation (all endpoints)
- [ ] Write admin runbook (fraud review)
- [ ] Write partner FAQ
- [ ] Update README.md
- [ ] Deploy to staging; validate with test data
- [ ] Monitor staging metrics for 24h
- [ ] Production rollout (10-day gradual)
- [ ] Partner email communication
- [ ] Final verification: all success criteria met

---

## Success Criteria

### Testing
- [ ] Unit test coverage: ≥90% on new code
- [ ] Integration tests: 100% pass
- [ ] E2E tests: 100% pass
- [ ] Load tests: p95 < 500ms, error rate < 1%

### Monitoring
- [ ] All 15+ Prometheus metrics exported
- [ ] Grafana dashboard populated with real data
- [ ] Alerts firing correctly (test with thresholds)
- [ ] No metric cardinality explosions (e.g., high-cardinality labels)

### Documentation
- [ ] API reference complete with examples
- [ ] Admin runbook: step-by-step fraud review
- [ ] Partner FAQ: 20+ questions answered
- [ ] README updated with affiliate section

### Production
- [ ] Zero incidents in first 7 days
- [ ] Attribution rate: >90% of conversions attributed via cookie
- [ ] Fraud false positive rate: <2% (monitor override actions)
- [ ] Partner satisfaction: NPS ≥ 50 (survey pilot group)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Load test reveals performance bottleneck | Medium | High | Tune DB queries, add indexes, implement caching before production |
| Metrics cardinality explosion (high-cardinality labels) | Medium | Medium | Use `key_id` not raw key; aggregate labels carefully |
| Grafana dashboard incomplete | Low | Low | Pre-build dashboard from staging data; review with team |
| Partner confusion about new API | Medium | Medium | Comprehensive docs, FAQ, email + video tutorial |
| Fraud false positives trigger complaints | High | High | Score-only mode for 7 days; easy override; partner support ready |

---

## Security Considerations

- **Test data**: Use synthetic data in tests; never use real partner data in staging without anonymization
- **Metrics security**: Ensure `/metrics` endpoint protected by bearer token (already)
- **Dashboard access**: Grafana restricted to admin/engineering VPN
- **Documentation**: Do not publish API keys in examples; use placeholders
- **Audit trail**: All admin fraud overrides logged with user ID and reason

---

## Next Steps

After Phase 6:
1. ✅ All phases complete
2. Post-launch: Monitor metrics daily for 30 days; tune thresholds
3. Gather partner feedback; iterate on UX
4. Expand: multi-currency payouts, tiered commission rates, sub-affiliate networks

---

**Phase Status**: Not Started  
**Blockers**: Phase 5 completion (enhanced fraud)  
**Next**: Begin after Phase 5 tests pass

---

## Rollback Plan

If critical issues arise post-deployment:

- **Cookie attribution**: Disable via `ENABLE_COOKIE_ATTRIBUTION=false` → fall back to URL param (existing)
- **Real-time WS**: Disable `affiliate_commissions` channel → no push, but REST still works
- **Enhanced fraud**: Set `FRAUD_AUTO_BLOCK=false` → score-only mode (no blocks)
- **Affiliate auth**: Remove `affiliateAuthMiddleware` from routes → tenant auth still works
- **Reporting**: Remove `/api/v1/referral/reports` routes → existing `/stats`, `/commissions` remain

Each feature flag has independent toggle. Zero-downtime rollout via config reload (no restart needed for flag changes).

---

**Plan Version**: 1.0  
**Last Updated**: 2025-06-21  
**All Phases Complete**: [ ] All 6 phases implemented, tested, documented, deployed
