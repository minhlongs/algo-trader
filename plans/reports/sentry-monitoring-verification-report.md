# Sentry + Monitoring Verification Report

Date: 2026-08-16
Scope: algo-trader go-live readiness for error tracking and observability

## 1. Sentry CI Integration

Verdict: FAIL

### Findings
- `.github/workflows/ci-cd.yml` — no `sentry-cli`, `@sentry/wizard`, or `SENTRY_*` secret usage.
- `.github/workflows/deploy.yml` — no Sentry upload or release tracking.
- `.github/workflows/cloudflare-deploy.yml` — no Sentry integration.
- `tsconfig.json` — no `sourceMap: true`; `dist/` contains 1216 files but zero `.js.map` / `.d.ts.map` files.
- `package.json` scripts — no `sentry-cli` or source map upload command.
- `config/monitoring.yaml` — references `${SENTRY_DSN}` but CI never injects it; no `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` in workflow secrets.
- `docs/beta-launch-checklist.md` — still lists "Sentry configured, source maps uploaded" as unchecked.
- `docs/production-verification.md` — marks Sentry as unchecked.

### Root cause
Sentry integration exists only as runtime DSN wiring (`src/utils/sentry-init.ts`, `src/shared/utils/sentry-init.ts`). CI never builds source maps, never calls `sentry-cli`, and never creates/associates releases in Sentry.

## 2. Sentry Runtime Configuration

Verdict: INCOMPLETE

- `src/shared/utils/sentry-init.ts` imports `@sentry/node` and calls `Sentry.init` with DSN + `tracesSampleRate: 0.1`.
- `src/utils/sentry-init.ts` is a stub that guards with `require('@sentry/node')` fallback.
- App entry uses `src/utils/sentry-init.ts` (`src/index.ts`), not the shared variant, so actual init is conditional on package existence.
- No release/version, environment tags, tracesSampleRate tuning, or server-name configuration beyond `NODE_ENV`.
- `docker/monitoring/docker-compose.monitoring.yml` is not explicitly checked here, but Sentry is not wired as a sidecar.

## 3. Monitoring Dashboards / Alerting

Verdict: CONCERNS

- Grafana dashboard JSONs present:
  - `docker/grafana/dashboards/*.json` — 8 dashboards
  - `grafana/dashboards/*.json` — 2 dashboards
- Alert rules present:
  - `docker/grafana/provisioning/alerting/latency-alerts.yml`
  - `docker/grafana/provisioning/alerting/qwen-alerts.yml`
  - `config/alertmanager.yml` / `config/alertmanager.yml.tpl`
  - `config/prometheus-alerts.yml`
- Dashboards and alerting are configured in-repo, but runtime availability depends on:
  - `docker/monitoring/docker-compose.monitoring.yml`
  - `config/prometheus.yml`
  - `docker/grafana/provisioning/datasources/prometheus.yml`
- Health checks in `monitoring.yaml` cover API, shard-ring, latency, error rate, NATS, and test failures — good coverage.
- No evidence that dashboards are provisioned on the VPS or that alert routing is operational for go-live.

## 4. Recommended Actions

1. Add Sentry source map generation:
   - update `tsconfig.json` → add `"sourceMap": true`
   - extend `package.json` build to emit `.js.map` files

2. Add CI upload step:
   - add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` secrets in GitHub repo settings
   - add `sentry-cli` install + `sentry-cli releases new` + `sentry-cli releases files ... upload-sourcemaps` to `.github/workflows/ci-cd.yml` and/or `.github/workflows/deploy.yml`

3. Pin runtime init:
   - standardize on `src/shared/utils/sentry-init.ts` and import it from `src/index.ts`
   - add `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `serverName` if applicable

4. Verify monitoring stack in production:
   - confirm `docker/monitoring/docker-compose.monitoring.yml` is deployed and running on VPS
   - validate Grafana dashboard provisioning and Prometheus scrape targets
   - validate alertmanager routing for PagerDuty/Slack in go-live

## 5. Evidence References

- `/Users/macbook/algo-trader/.github/workflows/ci-cd.yml`
- `/Users/macbook/algo-trader/.github/workflows/deploy.yml`
- `/Users/macbook/algo-trader/.github/workflows/cloudflare-deploy.yml`
- `/Users/macbook/algo-trader/tsconfig.json`
- `/Users/macbook/algo-trader/package.json`
- `/Users/macbook/algo-trader/src/utils/sentry-init.ts`
- `/Users/macbook/algo-trader/src/shared/utils/sentry-init.ts`
- `/Users/macbook/algo-trader/src/index.ts`
- `/Users/macbook/algo-trader/config/monitoring.yaml`
- `/Users/macbook/algo-trader/docs/beta-launch-checklist.md`
- `/Users/macbook/algo-trader/docs/production-verification.md`
- `/Users/macbook/algo-trader/docker/grafana/dashboards/`
- `/Users/macbook/algo-trader/docker/grafana/provisioning/alerting/`
- `/Users/macbook/algo-trader/config/alertmanager.yml`
- `/Users/macbook/algo-trader/config/prometheus-alerts.yml`