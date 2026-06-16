# Incident Response Runbook: Deployment Failure

**Severity:** P1 (Critical)  
**SLA:** Detection < 1m, Response < 2m, Resolution < 10m  
**Owner:** Platform SRE  
**Last Updated:** 2026-06-16

---

## Scenario

A deployment to Cloudflare Workers (single region or all regions) has failed or rolled back automatically. This could be due to build errors, configuration invalid, dependency issues, or capacity exceeded. New code is not live, or deployment stuck in pending state.

---

## Detection

### Automated Alerts

1. **Deployment Failure**
   - Query: `cloudflare_deployment_status{status!="success"} == 1`
   - Threshold: Any non-success deployment in last 10 minutes
   - Notification: PagerDuty P1, Slack #deployments

2. **No Recent Deployments**
   - Query: `time() - cloudflare_last_deployment_timestamp > 3600`
   - Threshold: No successful deployment in 1 hour (when expected)
   - Notification: Slack #deployments

3. **Health Check Failures Post-Deploy**
   - Query: `rate(http_requests_total{status=~"5.."}[5m]) > 0.1`
   - Threshold: Error rate spike after deploy
   - Notification: PagerDuty P1

### Manual Detection

```bash
# Check deployment status
cloudflared deployments list --since 30m

# Example output:
# ID      Region      Status      Commit      Started
# def123  us-east     FAILED      abc456      2m ago
# 789xyz  eu-central  SUCCESS     abc456      5m ago

# Check worker health
for region in us-east eu-central ap-southeast; do
  echo "=== $region ==="
  curl -s https://$region.algo-trader.com/api/health | jq '.status'
done

# Check CI/CD pipeline
gh run list --workflow=deploy.yml --status=failure --json=conclusion,displayTitle,url | head -5
```

---

## Response Steps (0-2 minutes)

### 1. Acknowledge

```bash
# Accept PagerDuty P1
# Post to #incidents and #deployments:
"🚨 DEPLOYMENT FAILURE - us-east region
Deployment def123 FAILED.
Impact: New code not live, existing version running.
Investigating root cause."
```

### 2. Gather Deployment Details

```bash
# Get deployment info
cloudflared deployments show --deployment-id def123

# Check build logs
cloudflared logs --deployment-id def123 --type build

# Check worker logs for errors
cloudflared logs --since 10m --region us-east --level error | head -50

# Check CI/CD logs
gh run view <run-id> --log-failed
```

**Common failure reasons:**
- Build error: TypeScript compilation failed
- Config validation: Invalid environment variables
- Quota exceeded: Worker size > 128MB
- Missing secrets: Required secrets not set
- Dependency install: npm ci failed

### 3. Determine Impact

```bash
# Is this:
# - Single region only? → Partial outage, other regions unaffected
# - All regions? → Full deployment failure, no impact yet
# - Rollback triggered? → Previous version restored

# Check current live version per region
for region in us-east eu-central ap-southeast; do
  echo "=== $region ==="
  curl -s https://$region.algo-trader.com/api/version | jq '{region, version, deployedAt}'
done
```

### 4. Immediate Actions

**If build failed:**

```bash
# Identify failing step from CI logs
# Common issues:

# 1. TypeScript errors
# → Fix locally, commit, retry deploy

# 2. NPM install failure
# → Clear cache and retry
cloudflared secrets put NPM_TOKEN --value "$NPM_TOKEN"
# or: package-lock.json out of date → run `npm install` locally

# 3. Worker size exceeded
# → Bundle analysis: `npx wrangler tail --format=json | jq '.scriptSize'`
# → Code-split, remove dependencies, enable compression
```

**If config validation failed:**

```bash
# Check required secrets
cloudflared secret ls

# Missing? Add them:
cloudflared secret put DATABASE_URL --value "$PROD_DB_URL"
cloudflared secret put ANTHROPIC_API_KEY --value "$ANTHROPIC_KEY"

# Invalid format? Fix in .env.prod and re-deploy
```

**If deployment stuck:**

```bash
# Cancel stuck deployment
cloudflared deployments cancel --deployment-id def123

# Retry with increased timeout
cloudflared deploy --region us-east --timeout 600
```

---

## Resolution (2-10 minutes)

### 5. Fix and Redeploy

**Workflow:**

```bash
# 1. Apply fix (based on root cause)
git commit -m "fix: <description>"
git push origin main

# 2. Wait for CI to pass
gh run watch --interval=10

# 3. Deploy to staging first (verify)
cloudflared deploy --environment staging --region us-east
# Check: https://staging.us-east.algo-trader.com/api/health

# 4. Deploy to production (canary 10%)
cloudflared deploy --region us-east --canary 10
# Monitor: curl https://us-east.algo-trader.com/api/health

# 5. If canary healthy (2 min), complete
cloudflared deploy complete --deployment-id <new-id>

# 6. Roll out to other regions
cloudflared deploy --region eu-central
cloudflared deploy --region ap-southeast
```

### 6. Verify

```bash
# Check all regions healthy
for region in us-east eu-central ap-southeast; do
  status=$(curl -s https://$region.algo-trader.com/api/health | jq -r '.status')
  echo "$region: $status"
  if [ "$status" != "ok" ]; then
    echo "❌ $region not healthy"
    exit 1
  fi
done
echo "✅ All regions healthy"

# Check version matches
curl -s https://us-east.algo-trader.com/api/version | jq '.version'
# Should be new commit SHA

# Check no error spikes
# Grafana: Error rate panel (should be baseline < 0.1%)
```

### 7. Monitor Post-Deploy

```bash
# Watch metrics for 10 minutes
watch -n 30 'curl -s "https://prometheus.../error_rate" | jq'

# Check logs for new errors
cloudflared logs --since 10m --level error | grep -i "uncaught\|panic\|fatal" | head -20
```

---

## Common Failure Scenarios

### A. Worker Size Exceeded (128MB)

```bash
# Check bundle size
npx wrangler tail --format=json | grep '"scriptSize"'

# If > 100MB:
# 1. Remove unused dependencies
# 2. Code split: move heavy logic to separate workers
# 3. Use dynamic imports: `const llm = await import('./llm-agent.js')`
# 4. Tree-shake: ensure ES modules
```

### B. Missing Environment Variables

```bash
# Pre-deploy validation
cloudflared secret ls
# Compare with required list in wrangler.toml

# Or use --dry-run to catch early
cloudflared deploy --dry-run --region us-east
```

### C. TypeScript Compilation Error

```bash
# Check locally first
npm run build

# If build succeeds locally but fails in CI:
# 1. Ensure Node.js version matches (use .nvmrc)
# 2. Clear CI cache (gh actions: "Clear cache from workflow")
# 3. Check for platform-specific issues (Darwin vs Linux)
```

### D. Quota Exceeded

```bash
# Check Cloudflare usage
cloudflared quota show

# If script upload size exceeded:
# 1. Reduce bundle size (see scenario A)
# 2. Request quota increase via Cloudflare support
```

---

## Post-Mortem

```markdown
# Deployment Failure Post-Mortem

## Timeline
- Deploy started: <timestamp>
- Failure detected: <timestamp> (after X minutes)
- Root cause identified: <timestamp>
- Fixed and deployed: <timestamp>
- Total outage: <X> minutes

## Root Cause
<Build error / config missing / bundle size exceeded>

## Impact
- New code delayed: <X> hours
- Regions affected: <list>
- User impact: <none / degraded / outage>

## Fix Applied
<commit hash> <description>

## Action Items
- [ ] Add pre-deploy validation script (check secrets, build locally)
- [ ] Reduce bundle size by Y MB (due <date>)
- [ ] Implement blue-green deployment (due <date>)
- [ ] Add deployment health checks (automatic rollback on 5xx spike)
```

---

## Prevention

1. **Pre-deploy checks:**
   - Run `npm run build` locally
   - Verify all secrets exist: `cloudflared secret ls | grep -v present`
   - Check bundle size: `npx wrangler tail --format=json | grep scriptSize`

2. **Staging validation:**
   - Deploy to staging before production
   - Run smoke tests: `/api/health`, `/api/version`

3. **Canary deployment:**
   - Always use canary (10% → 100%)
   - Auto-rollback on error threshold

4. **CI/CD gates:**
   - Build must pass
   - All tests pass
   - Bundle size < 128MB (with margin)

---

## Escalation

- All regions failed deployment → P0
- Deploy stuck > 15 min without progress → P1
- Failed deployment causes production outage → P0

---

## Related Documentation

- Deployment guide: `docs/deployment-guide.md`
- CI/CD pipeline: `.github/workflows/deploy.yml`
- Rollback procedures: `docs/rollback-procedures.md`
- Cloudflare Workers limits: `https://developers.cloudflare.com/workers/platform/limits/`

---

## Runbook Verification

Weekly:
1. Test deployment to staging
2. Simulate failure (inject config error)
3. Verify alert fires
4. Practice rollback procedure
5. Validate canary promotion flow
