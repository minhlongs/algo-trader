# Phase 04 — Load-Test Gate Parameterization (tooling)

## Context Links
- Plan: [`../plan.md`](../plan.md)
- Depends on: [`phase-03-final-integration-check-host-correction.md`](phase-03-final-integration-check-host-correction.md)

## Overview
- **Priority:** P1 (tooling)
- **Current status:** pending
- **Goal:** make the k6 script's target RPS explicit and CI-overridable so the "12k RPS" gate is real, and pin it to the live host.

## Key Insights
- `tests/load/raas-gateway-load-test.js` defaults to `VUS = parseInt(__ENV.VUS || '5000', 10)`
  with `executor: 'ramping-vus'`. So the documented "12k RPS" gate never actually ran at 12k
  unless someone remembered to pass `VUS`.
- `docs/production-rollout-plan.md:78` requires "12k RPS for 30m" and line 143 requires
  `p95 <100ms, error <1%`. Neither number is enforced by the script.
- JSON is only written to `reports/load-test/region-latency.json` when explicitly wired; check
  whether CI persists it (`.github/workflows/load-test.yml`) — if not, the "evidence" claim is unbacked.
- VUs ≠ RPS. Whether 12,000 VUs actually yields 12,000 RPS depends on per-request latency. Record
  the measured RPS, not just the VU count, or the gate can pass at 4k RPS while genuinely running 12k VUs.

## Requirements
- `TARGET_RPS` (or equivalent) configurable via `__ENV`; default the documented 12,000.
- Assert the measured RPS and latency at the end so the gate fails when targets are missed.
- Emit a JSON artifact whose path is stable and referenced by the docs.
- Keep the VU knobs (`VUS`, durations) overridable without editing the script.

## Architecture
Parameterize, don't fork. Use k6 `thresholds` (built-in) rather than hand-rolled assertions.

## Related Code Files
- **Modify:** `tests/load/raas-gateway-load-test.js`
- **Modify:** `package.json` (`test:load*` scripts to carry a `-e TARGET_RPS=...` default)
- **Read only:** `.github/workflows/load-test.yml`

## Implementation Steps
1. Add `const TARGET_RPS = Number(__ENV.TARGET_RPS || 12000);` and a `thresholds` block: `http_req_duration: ['p(95)<100']`, `http_req_failed: ['rate<0.01']`.
2. Report actual achieved RPS in the output (`http_reqs` total / elapsed) — screenshot or log into evidence.
3. Update `package.json` `test:load` to pass an explicit target and default duration of 30m.
4. Verify CI (`.github/workflows/load-test.yml`) uploads/stores the JSON artifact; wire it if missing.
5. Smoke-run for 30 seconds at reduced scope to prove the script's plumbing (and that thresholds flip correctly on a deliberate failure).
6. Capture smoke output to `plans/261020-1345-golive-zero-bug/evidence/load-test-smoke.txt`.

## Todo List
- [ ] `TARGET_RPS` env-configurable, default 12000
- [ ] p95 + error-rate thresholds declared
- [ ] JSON artifact path referenced in the docs
- [ ] Achieved RPS reported (not just VUs)
- [ ] Smoke run recorded
- [ ] CI artifact persistence verified

## Success Criteria
- A 30s smoke run produces a pass and a JSON artifact; a deliberately broken threshold makes the run fail (fail-open is a bug).
- `k6 run --quiet tests/load/raas-gateway-load-test.js` exits non-zero when p95 exceeds the threshold.

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Running a 12k RPS test against live production as an accidental DoS | **High** | Point at staging (`wrangler dev`) or a preview URL by default, NOT the production host. Confirm the target before the full 30m run |
| Load test billed/abused as traffic (Cloudflare plan limits) | Medium | Agree window, monitor Cloudflare dashboard, abort on non-2xx spikes |
| vU/RPS confusion makes the gate vacuous | Medium | Report and gate on measured RPS, and state the VU→RPS conversion openly |

## Security Considerations
- Do not embed API keys/tokens in load-test requests.
- Load test must not write to production data stores — verify the endpoints exercised are read-only, or point the test at a scrubbed environment.

## Next Steps
→ Phase 05 runs the real test and records evidence.

## Unresolved Questions
- **User decision:** which host should the 12k run target — production (`api.cashclaw.cc`), a preview deploy, or `wrangler dev`? This determines whether Phase 05 is safe to run unattended.
