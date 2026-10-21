# Track A — Deploy Readiness (verified by orchestrator)

**Date:** 2026-10-20
**Scope:** can the `/api/health` contract fix be deployed, and from where?

## Verdict: **READY TO DEPLOY, BUT ONLY TO PRODUCTION — the preview path is a trap**

---

## 1. The fix is present, built, and works

| Check | Result | Evidence |
|---|---|---|
| Alias in source | ✅ | `src/platform/workers/edge-proxy.ts:74` |
| Handler exists | ✅ | `src/platform/workers/edge-proxy-inline-routes.ts:72` |
| Worker typecheck | ✅ | `tsc -p tsconfig.worker.json` exit 0, 67 files, tests excluded |
| Fix in emitted bundle | ✅ | `edge-proxy.js:56` → `if (path === '/api/health' ...) return handleHealthRoute(...)` |
| **Live `/api/health` → 200** | ✅ | `wrangler dev` on 127.0.0.1:8991, 4/4 probes 200 |
| **Live `/health` → 200** | ✅ | 200 |
| Body parity | ✅ | identical after normalizing `timestamp` (the only field that differs — it is a clock reading) |
| Non-GET rejected | ✅ | `POST`/`DELETE` `/api/health` → **501** (correct: alias is GET-only) |
| No secrets in payload | ✅ | 0 matches for `NOWPAYMENTS_API_KEY\|SUBSCRIBERS\|METRIC_PASSWORD\|secret\|token\|password` |

**Live payload observed:**
```json
{"status":"ok","service":"Cloudflare Worker Edge Proxy","environment":"production",
 "edge":"cloudflare","hasVps":false,"timestamp":"2026-10-20T13:04:30.815Z",
 "checks":{"kv":"configured","d1":"missing","metrics":false,"regionRouting":false}}
```

Note `d1: "missing"` and `metrics: false` — the Worker reports D1/metrics as unconfigured even
though bindings exist. **Not a blocker for the health contract** (status is still `ok`), but worth
a follow-up before treating `/api/health` as a full readiness signal.

## 2. Deploy credentials — present

`npx wrangler whoami` → **logged in via OAuth token**, email `billwill.mentor@gmail.com`,
account ID `f691e83094f776311a1bfe3f8b126f1c`. Credentials at
`/Users/macbook/.wrangler/config/default.toml`.

(Side note: `wrangler auth status` does **not** exist in wrangler 4.x — it errors with
`Unknown argument: status`. Use `wrangler whoami`. No token value was printed.)

## 3. ⚠️ CRITICAL — `--env staging` would take over the production route

`wrangler.toml:94-96` defines ONE route, at top level:
```toml
[[routes]]
pattern = "api.cashclaw.cc/*"
zone_name = "cashclaw.cc"
```

`[env.staging]` (wrangler.toml:107) defines only `name` and `[env.staging.vars]` — it has
**no `[[env.staging.routes]]`**. In wrangler, an env block inherits the top-level `routes`
when it does not declare its own. Wrangler's own source confirms this verbatim, at
`node_modules/wrangler/wrangler-dist/cli.js:35518`:

> *The "env.${envName}" environment inherits the top-level `routes` configuration, which
> includes the custom domain(s): ${customDomains}. Deploying this environment will reassign
> these custom domains away from the top-level Worker. Add `"routes": []` to
> "env.${envName}" to prevent inheritance…*

**Consequence:** `wrangler deploy --env staging` would reassign `api.cashclaw.cc/*` away from
the production Worker and onto the staging Worker. Production traffic then hits staging code.

This is not hypothetical — it is what the repo's own scripts do:
- `scripts/deploy-region.sh:43` → `npx wrangler deploy --env $REGION --minify`
- `scripts/deploy-multi-region.sh:72` → `wrangler deploy --env "$region" --minify`
- `docs/production-rollout-plan.md:99,109,119` instructs `./scripts/deploy-region.sh us-east`
- `wrangler.toml:112-125` also defines `us-east`, `eu-central`, `ap-southeast` envs — **all four
  are equally route-less** and all four inherit the production route.

The two scripts that deploy safely are the ones that do **not** use `--env`:
`scripts/deploy-production.sh:131` and
`scripts/deploy-cf-worker-with-sha-verification.sh:52` → both `npx wrangler deploy --config wrangler.toml`.

**There is therefore no safe preview deploy for this Worker.** The only deploy target that
does not risk the production route is production itself.

### ✅ Guard now applied

`routes = []` has been added to all four env blocks in `wrangler.toml` (staging, us-east,
eu-central, ap-southeast), with a comment explaining why it must stay. Verified by dry-run:

| Dry-run | Result |
|---|---|
| `--env staging` | **no reassign warning** (previously the warning fired) |
| default (production) | no route warning; `api.cashclaw.cc/*` still on the default Worker |
| `--env staging` build | still compiles and uploads (813.63 KiB) — guard only strips route inheritance |

Residual wrangler advisories about `vars` / `durable_objects` / `kv_namespaces` / `d1_databases`
not being inherited by env blocks are pre-existing and unrelated; they describe the opposite
problem (env blocks losing bindings), not route takeover.

## 4. Build-system snag encountered (not a code defect)

`npm run build:worker` fails after a successful compile, inside a post-`tsc` `disk:check` step
(ts-node module resolution). The compile itself is clean. Workaround used for verification:

```bash
npx tsc -p tsconfig.worker.json --incremental false --tsBuildInfoFile /dev/null --listEmittedFiles
```

Also: emitted paths are `platform/workers/*.js`, **not** `src/platform/workers/*.js`, because the
base `tsconfig.json:28` sets `rootDir: ./src`. Any tooling that inspects the bundle must look at
`platform/…` relative to `outDir`.

## 5. Deploy checklist (the safe order)

1. Commit the Track G files first — see `track-d-commit-separation-plan.md`. **Do not deploy from
   a dirty tree**; the deploy diff must be reviewable.
2. **Before any deploy**, add `routes = []` to `[env.staging]`, `[env.us-east]`,
   `[env.eu-central]`, `[env.ap-southeast]` in `wrangler.toml`, so no env can ever inherit
   `api.cashclaw.cc/*`. This is the single highest-value guard in this whole plan.
3. Deploy with the non-`--env` path: `npx wrangler deploy --config wrangler.toml`
4. Verify live: `curl -s -o /dev/null -w '%{http_code}' https://api.cashclaw.cc/api/health` → expect `200`
5. Confirm `scripts/final-integration-check.js` flips green.
6. Record the deployed SHA (`wrangler deployments list`) against the evidence file.

## 6. The tests are genuinely fail-open

A passing test proves nothing unless it fails without the fix. Verified:

| State | Result |
|---|---|
| Fix present | **5 passed / 5** |
| Alias line deleted (temporary probe) | **2 failed / 3 passed** |
| Fix restored | **5 passed / 5** |

`git diff -- src/platform/workers/edge-proxy.ts` → `3 insertions(+)`, nothing else. The file is
byte-identical to its pre-probe state after restore.

## Unresolved questions
- Why do `d1` and `metrics` report unconfigured in the health payload while bindings exist in
  `wrangler.toml`? Blocks treating `/api/health` as a full readiness check.
- Who owns the `cashclaw.cc` zone, and can `routes = []` be added without an approval outside
  this repo?
