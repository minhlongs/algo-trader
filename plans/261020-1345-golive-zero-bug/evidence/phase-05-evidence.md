# Phase 05 — Load-Test Execution & Evidence

**Completed:** 2026-10-20T11:13:56Z

## Method: staged locally, not against production

A 12k RPS run against live production would harm real customers, so the test was executed
against a local `wrangler dev` worker deploy (`--local`, port 8799).

## Result 1 — low target (control), 15s @ 200 RPS

```
target_success   : 100.00%  (3001/3001)
http_req_failed  : 0.00%
http_req_duration: p95 = 5.23ms
throughput       : 200.03/s (matched target exactly)
dropped_iterations: none
```

## Result 2 — 12k target, 30s (the documented gate)

```
target_success   : 99.01%  (48786/49271)
http_req_failed  : 0.98%  (485/49271)
no server error  : 100%  (0 × 5xx — worker never faulted)
http_req_duration: p95 = 550.09ms   → FAILS the p95<100ms gate
throughput       : 1616.16/s         → ~13.5% of the 12000 target
dropped_iterations: 310731           → k6 could not sustain the requested rate
```

## Interpretation — the ceiling is the harness, not the worker

The two runs together are decisive: at 200 RPS the worker serves p95 5.2ms with zero errors,
so the worker code is fast. At 12k the *same* worker collapses to 1.6k req/s with 310k dropped
iterations — classic single-process saturation, i.e. the local `workerd` dev runtime being
saturated, not a code defect.

**Consequence: the 12k RPS gate is NOT provable on a single local machine.** A real 12k RPS
result requires a distributed k6 cluster against the production Cloudflare edge (many k6
instances, geographically spread), which cannot be done safely from this session.

Also note the live-production probe in Phase 04 already showed p95 ≈ 110ms at only 20 RPS on
the real edge — so even the edge appears to sit close to the 100ms budget.

## Phase 05 exit criteria status

- [x] Test executed with recorded numbers (not estimated)
- [x] Pass/fail decided against all three metrics (RPS, p95, error rate)
- [x] Told the truth: 12k RPS is UNPROVEN, and why
- [ ] 12k RPS validated on a representative environment — **NOT DONE (and not achievable
      locally)** — must be run against production with a distributed k6 setup, in an
      agreed window, or the target must be revised

## CLAUDE.md impact

CLAUDE.md lists "load test 12k RPS validated" as a deploy blocker. As of this phase that
blocker is **NOT satisfied**. Phase 08 must therefore record a NO-GO on that criterion
rather than assume it away.
