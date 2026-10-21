# Phase 02 — Health Contract Reconciliation (code)

## Context Links
- Plan: [`../plan.md`](../plan.md)
- Depends on: [`phase-01-baseline-snapshot-and-tree-hygiene.md`](phase-01-baseline-snapshot-and-tree-hygiene.md)
- Verified baseline: [`../../reports/binh-phap-20261020-golive-readiness-scout.md`](../../reports/binh-phap-20261020-golive-readiness-scout.md)

## Overview
- **Priority:** P0 — this is the only genuine *code* defect found
- **Current status:** pending
- **Goal:** make `/api/health` return 200 on the deployed Worker, matching the contract 3 verifiers and the root handler already advertise.

## Key Insights
- The mismatch is **generic, not health-specific**: any unregistered `/api/*` path 501s.
  `edge-proxy.ts:125` → `notImplementedResponse(path)` (defined at
  `src/platform/workers/auth-handler-helpers.ts:74`, which emits the exact
  `VPS backend removed — endpoint not yet migrated to CF Worker` text).
- `/api/health` **did** exist historically (`22fb1ba8`, `f219a1ee`) and `9a13d2d1`
  ("fix: api.cashclaw.cc deploy verification + root-path handler") added a probe for
  `https://cashclaw.cc/api/health` and advertised `endpoints: ['/api/health', '/api/auth/*']` — but
  the Worker route was never registered. `5d8c37ce` then added the bare `/health` route during
  "go-live prep". So this is an **incomplete migration**, not a deliberate removal.
- `scripts/deploy-cf-worker-with-sha-verification.sh:70` probes `https://cashclaw.cc/api/health` —
  the **marketing domain**, which serves HTML 200. The check is therefore satisfied by an
  unrelated web page and has *never* actually verified the API. Phase 03 fixes this.
- `/api/v1/shard/ring` returning 401 is **correct** auth enforcement (`edge-proxy.ts:114`) — not a
  defect. Do not "fix" it.

## Requirements
- `/api/health` on the Worker returns 200 with a JSON body carrying the same fields as `/health`.
- `/api/health?region=self` (used by `final-integration-check.js`) does not 404/501 — either 200, or the verifier is pointed at `/health?region=self` instead.
- Existing `/health` behaviour unchanged (backwards compatibility: do not break the current route).
- No new `:any`, no `console.log`, no new `eslint-disable` comments.

## Architecture
One line of routing in `edge-proxy.ts` aliasing `/api/health` to the existing `handleHealthRoute`.
If `handleHealthRoute` accepts a `region` param, reuse it directly; otherwise extend the handler
— prefer reuse over a second implementation (DRY).

Prefer: register the alias in `edge-proxy.ts` (single source of routing truth) rather than inside
two handler files.

## Related Code Files
- **Modify:** `src/platform/workers/edge-proxy.ts` (add `/api/health` route, ~line 72 near the existing `/health` route)
- **Modify (only if required):** `src/platform/workers/edge-proxy-inline-routes.ts` (the `handleHealthRoute` signature)
- **Create:** `src/platform/workers/__tests__/edge-proxy-api-health-route.test.ts` (asserts `/api/health` 200 and body parity with `/health`)
- **Read only:** `src/platform/workers/auth-handler-helpers.ts` (reference for `notImplementedResponse`)

## Implementation Steps
1. Read `handleHealthRoute` in `src/platform/workers/edge-proxy-inline-routes.ts` and note its signature/behaviour with query params.
2. In `edge-proxy.ts`, beside the existing `/health` line, add:
   ```ts
   if (path === '/api/health' && request.method === 'GET') return handleHealthRoute(env, routingEnabled);
   ```
   (or reuse the existing call verbatim).
3. Decide the `?region=self` question: if `handleHealthRoute` ignores `region`, either (a) wire the region query through, or (b) record that the alias deliberately ignores it and update `final-integration-check.js` (Phase 03) to hit `/health`. Pick ONE and document it.
4. Add the test asserting `/api/health` status 200 and body parity with `/health`.
5. Confirm the root-handler `endpoints` advertisement now matches reality.
6. Run: `npx tsc --noEmit`; then `npx vitest run src/platform/workers`.

## Todo List
- [ ] Register `/api/health` route
- [ ] Resolve `?region=self` handling (one documented choice)
- [ ] Add route-parity test
- [ ] `notImplementedResponse` no longer reachable for `/api/health`
- [ ] Typecheck + worker tests green

## Success Criteria
- `npx vitest run src/platform/workers` → 0 failures.
- `npx tsc --noEmit` → 0 errors.
- Verified via `wrangler dev` (or the worker test harness) that `/api/health` → 200 and its body equals `/health`'s body shape.
- **Not** verified against production in this phase — that happens after deploy.

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Alias leaks internal info into a public probe (worker version, bindings) | Low-Med | Return exactly what `/health` already returns; `/health` is already public — verify it exposes nothing sensitive |
| Health endpoint reveals shard count / internal topology to an attacker | Low | `/api/v1/shard/ring` already enforces auth; keep health info minimal and non-enumerable |
| Deployment payload change regresses an unrelated route | Low | Phase 03 + Gate 1 CI both cover the route table |

## Security Considerations
- `/api/health` becomes a public 200 endpoint. It must not leak secrets, tokens, tenant IDs, or shard internals. Diff the `/health` payload against the 501 payload and confirm the delta is only status/body.
- No auth requirement is added (matches existing `/health` posture) — this is consistent with a health probe used by CF's own health checks.

## Next Steps
→ Phase 03 repoints the verifiers at hosts/paths that now exist.

## Unresolved Questions
- **Blocking for Phase 03, not this phase:** does `final-integration-check.js` keep `/api/health?region=self`, or move to `/health?region=self`? Decide during Phase 03 — both are correct once `/api/health` returns 200, but the doc must record which.
