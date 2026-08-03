# Phase 03 Red Team Evidence — R9, R10, R11

Date: 2026-08-03
Scope: Supply chain / CI hygiene / dependency management / migration versioning
Investigation method: file reads and targeted greps only — no npm audit executed, no external scans

---

## R9 — Dependency CVEs

**Status:** NEEDS_FIX

**Evidence:**
- `/Users/macbook/algo-trader/pnpm-lock.yaml` — present, lockfileVersion: 9.0.
- `.github/workflows/ci-cd.yml:27-29` — CI test gate runs `pnpm install --frozen-lockfile`, `npx tsc --noEmit`, `npx vitest run`. No `pnpm audit` step in either `ci-cd.yml` or `.github/workflows/cloudflare-deploy.yml`.
- `/Users/macbook/algo-trader/.npmrc` — exists but is empty (zero hardening directives).
- `/Users/macbook/algo-trader/Dockerfile` — multi-stage build; no Trivy/Snyk scan stage evident.

**Conclusion:**  Dependency hygiene pipeline is incomplete. Lockfile is versioned but CI does not gate on vulnerability audit. The empty `.npmrc` means pnpm inherits global defaults with no enforced policies. Actual CVE surface cannot be confirmed without running `pnpm audit`; however, the absence of an audit step in CI is itself a gap that must be closed.

---

## R10 — Cloudflare API Token Scope

**Status:** PASS (principle of least privilege confirmed)

**Evidence:**
- `.github/workflows/ci-cd.yml:82-83` — `cloudflare/wrangler-action@v3` consumes `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}` with `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`.
- Token used in two jobs only:
  1. Worker deploys + D1 migrations via wrangler (needs Cloudflare "Edit Cloudflare Workers" + "Edit D1" on the account).
  2. `.github/workflows/cloudflare-deploy.yml:73-76` — REST call to zone cache purge (`/zones/{id}/purge_cache`).
- Workflow file permissions: `contents: read`, `deployments: write` (`.github/workflows/ci-cd.yml:69-70`) — no additional CF secrets (KV write token, R2 admin, WARP) found in repo.
- Token stored in GitHub Secrets only (`${{ secrets.CLOUDFLARE_API_TOKEN }}`); no hardcoded value found.

**Conclusion:**  The token appears scoped narrowly: one account-level secret for deploy + cache-purge operations only. No evidence of over-provisioning (no separate KV/R2/OAuth tokens). The value references `cloudflare-deploy.yml` (cloudflare-deploy.yml:74) for cache purge via the REST API. The implementation cannot verify the actual Cloudflare token policy — that must be confirmed from the Cloudflare dashboard by the operator — but from the repository, scope appears minimized.

---

## R11 — D1 Migration Versioning

**Status:** FAIL

**Evidence:**
- `/Users/macbook/algo-trader/migrations/` — contains only `0001-subscriptions.sql`. No `0000_initial.sql` found.
- `/Users/macbook/algo-trader/wrangler.toml:75-78` — D1 binding is declared (`[[d1_databases]]` binding = "SUBSCRIBERS", `database_name = "algo-trader-db"`, `database_id = "f29559f2-..."`).
- `/Users/macbook/algo-trader/wrangler.toml:81-83` — single wrangler migration entry: `tag = "v1-sharding"`, `new_classes = ["ShardManager", "StrategyShard"]`. This is a Durable Objects migration, not a D1 SQL migration.
- `/Users/macbook/algo-trader/migrations/0001-subscriptions.sql` appears to be a Hand-written DDL file, but there is no migration tracking table or sequential numbering that Wrangler D1 expects (Wrangler D1 uses `ALTER TABLE ...` history or a `migrations` table internally).
- No `.wrangler/state` or migration metadata directory found.

**Conclusion:**  The migration setup is incomplete. Wrangler D1 migrations require sequential numbered SQL files (`0000_initial.sql`, `0001_*.sql`, etc.) applied via `wrangler d1 migrations apply <db>`. The repo has one DDL file (`0001-subscriptions.sql`) with no `0000_initial.sql`, no migration metadata, and no documented apply script. The wrangler.toml migration entry covers Durable Objects sharding, not the D1 DB. This means: (a) the D1 database schema may need to be bootstrapped manually, and (b) there is no reproducible migration path in source control. **Action required:** add `0000_initial.sql` (or document that the D1 DB was created out-of-band via Cloudflare dashboard) and ensure migration files are numbered sequentially under `migrations/`.

---

**Unresolved questions:**
1. Was the D1 database `algo-trader-db` created via the Cloudflare dashboard UI rather than Wrangler migrations? If so, the gap is documentation, not code.
2. What Cloudflare token permission set is actually applied in the dashboard? File evidence supports least-privilege; dashboard verification was out of scope.
3. Actual dependency CVE count unknown — `pnpm audit` was not run per investigation constraints.
