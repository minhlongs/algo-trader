## Code Review Summary
### Scope
- Files: src/platform/audit/audit-hooks.ts, src/platform/audit/__tests__/audit-hooks.test.ts, src/desk/trading-pipeline.ts, src/platform/api/routes/credentials-routes.ts, src/forest/rate-limit/redis-rate-limiter.ts
- LOC: ~240 across touched files
- Focus: AUD-001 and RL-001 compliance audit wiring — side-effect-free verification

### Overall Assessment
Wiring is correct and minimal. Emitters are thin pass-throughs that do not alter business semantics. All six acceptance tests pass. One low-severity informational finding. No blocking defects.

### Critical Issues
None.

### High Priority
None.

### Medium Priority
**credentials-routes.ts `actionBy` uses `tokenSubscriberId`, not operator identity**
The emitCredentialUpsertAuditEvent call passes `actionBy: tokenSubscriberId`, which is `claims?.sub` — a JWT subject. If the sub is a opaque or technical identifier (UUID, service account ID) instead of a human-readable operator identity, the audit trail's actor column is technically accurate but operationally useless for compliance review. Low risk if sub always resolves to a human user in this auth system. Worth a follow-up check against the auth provider.

### Low Priority
None.

### Edge Cases Found by Scout
- 429 audit path is wrapped in its own try/catch (redis-rate-limiter.ts:173-177). If emitRateLimitAuditEvent itself fails, the 429 response still reaches the client — this is correct and matches AUD-001 intent (audit failure must not break the authz path).
- drawing-pipeline.ts emits trade_rejected *before* returning when drawdown blocks the trade. If caller retries, a duplicate trade_rejected event can be emitted. Acceptable — drawdown events are idempotent by nature (same tier, same portfolio value should produce identical events).

### Positive Observations
- Direct appendTenantAuditLog removed from credentials-routes.ts (verified: grep returns zero hits). Prevents duplicate emission if future emitters are added.
- emitTradeAuditEvent is called *after* wallet.recordTrade succeeds — correct ordering (no phantom trade_executed if write fails).
- Audit hook failure in rate-limiter is swallowed with a log.warn and the original 429 response is preserved. No data leak of audit errors to API response body.

### Recommended Actions
1. Verify if `claims?.sub` is always a human-readable operator identity for credentials audit purposes. If not, resolve a display name before passing to `actionBy`.

### Metrics
- Type Coverage: unchanged
- Test Coverage: 6/6 tests passing
- Linting Issues: none reported by test run

### Unresolved Questions
1. Is `tokenSubscriberId` (claims?.sub) a displayable operator identity or an opaque ID?
