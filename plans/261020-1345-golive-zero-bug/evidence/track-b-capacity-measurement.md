# Track B — Capacity Measurement (bisection against a local `wrangler dev`)

**Date:** 2026-10-20
**Target:** local `wrangler dev` on 127.0.0.1:8995, k6 v2.0.0, `constant-arrival-rate`
**Host:** darwin arm64, 10 CPUs
**Purpose:** establish what ONE Worker instance can actually sustain, as an honest input to the
12k RPS claim. This is NOT a production measurement.

---

## 1. Method — and the trap it had to avoid

The obvious approach — run k6 at N RPS, read the error rate — is **invalid** if the server dies
mid-run. A crashed server refuses connections, so every subsequent request fails with
`duration = 0s` and k6 reports a 100% error rate. Read naively, that looks like
"capacity is below 1000 RPS." It is not: it is "the server died."

I hit exactly this. After the worker crashed, a 1000 RPS run reported **100% failure**
(`25,001 / 25,001`, `duration = 0s`) — a rate that had measured **0% failure** minutes earlier
on the same binary. The difference was entirely server liveness.

So every run below is guarded by a liveness probe **before and after**:

```bash
pre=$(curl ... /api/health)     # must be 200 or the run is ABORTED
k6 run ...
post=$(curl ... /api/health)    # if not 200, the numbers are connect-failures — discarded
```

Runs where `post ≠ 200` are marked **INVALID** and excluded from the capacity conclusion.

## 2. Results

| RPS | pre | post | p95 | error rate | Verdict |
|---|---|---|---|---|---|
| 200 | 200 | 200 | **3.68 ms** | 0.00% | VALID |
| 1000 | 200 | 200 | **72.89 ms** | 0.00% | VALID |
| 1200 | 200 | 000 | 655 ms | 63.7% | **INVALID** — crashed mid-run |
| 1400 | 200 | 000 | 655 ms | 63.7% | **INVALID** — crashed mid-run |
| 1800 | — | 000 | — | — | ABORTED — worker dead before start |

### The two valid data points are the finding

- **200 RPS → p95 3.68 ms, 0% errors.** The Worker's own code is fast.
- **1000 RPS → p95 72.89 ms, 0% errors.** Still all-200, and still inside the p95<100ms threshold.
- **Between 1000 and 1200 RPS the process dies.**

Latency is climbing steeply as load rises (3.7 ms → 72.9 ms across a 5× load increase) — the
knee is visible right at the top of the valid range, so **~1000 RPS is not a comfortable ceiling,
it is the last survivable point before the cliff.**

## 3. What kills it — and why this is NOT a Worker capacity number

The crash is **not** the Worker exceeding its CPU budget. Two independent signatures:

1. `Error in ProxyController: Error inside ProxyWorker` — the failure is in wrangler's **proxy
   layer** (the local dev harness in front of workerd), not inside the Worker's request handler.
2. `uncaught exception; source = Uncaught (in promise); stack = Error: Network connection lost.` —
   a dropped socket in the harness, reproduced identically on two separate worker instances (ports
   8993, 8994, 8995) at the same load.
3. The crash message body is **empty** (`✘ [ERROR]` followed by blank lines) on both instances —
   a known-shape wrangler diagnostics bug. Wrangler 4.123.0 is in use; 4.151.3 is available.

Also observed in the worker log just before death: request latencies ballooning to 300–350 ms
(from ~1.4 ms), consistent with the harness — not the Worker — becoming the bottleneck.

**Conclusion: ~1000–1200 RPS is the ceiling of the LOCAL DEV HARNESS on one machine.**
It is a floor on what production could do, and an upper bound on what this measurement can prove.
It says nothing reliable about the Cloudflare edge.

## 4. Direct answer to the 12k RPS question

| Claim | Can this measurement support it? |
|---|---|
| Worker serves 12k RPS | **No** |
| Worker serves 1000 RPS at p95<100ms, 0% errors | **Yes** — directly measured |
| 12k is achievable with N instances | **Plausible but unproven** — 12 × this, and local-harness limits don't map linearly to the edge |

Prior evidence in `go-no-go.md` (load test never executed; 1.6k ceiling) is now refined: the real
survivable local number is **~1000 RPS**, with a *crash* rather than graceful degradation above it.

**Graceful-degradation gap (worth noting):** the harness dies rather than shedding load. If the
production edge behaved the same way under overload, an overload incident would be an outage, not
a slowdown. That is a *separate* risk from raw capacity and is arguably the more important one —
but it cannot be assessed locally, because the death is in the harness.

## 5. Why a production measurement is still required (and is the only valid one)

The local harness crashes at ~1k on a 10-CPU machine. The production edge is a different runtime
with different connection handling, so no local number extrapolates to it. NO-GO condition #3
therefore remains **open**, and the two honest options are unchanged:

1. A distributed k6 run against the production edge in an agreed window (this is the only way to
   prove 12k), **or**
2. Revise the 12k target downward to what has actually been measured, and state the caveat.

Option 2 is defensible today. Option 1 needs a load-test window approved by the zone owner —
**`cashclaw.cc` is production customer traffic and must not be load-tested without agreement.**

## 6. Reproducing

```bash
npx wrangler dev --config wrangler.toml --port 8995 --ip 127.0.0.1 &

TARGET_RPS=1000 DURATION=20s BASE_URL=http://127.0.0.1:8995 \
  k6 run tests/load/api-gateway-load-test.js
# thresholds: http_req_duration p(95)<100ms, http_req_failed rate<0.01
```

Always check `/api/health` before and after. Never trust a run that ends with a dead server.

## Unresolved questions
- Is the `Network connection lost` / `ProxyWorker` crash reproducible on wrangler 4.151.3?
  Cheap to check, would likely raise the local ceiling. Not done here (upgrading wrangler is a
  repo-level change).
- No production load-test window exists. Needs an owner decision.
- The load harness probes 5 public routes; auth-gated endpoints (coupons, telegram, webhooks) are
  still unexercised under load.
