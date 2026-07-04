# Phase 03 — IronClaw DLP (Outbound Filter + Audit Log)

**File ownership:** `src/ironclaw/**`, `src/audit/dlp-outbound-recorder.ts`, `src/audit/dlp-pattern-matcher.ts`, `src/db/migrations/012_ironclaw_*.sql`

## Context Links

- PDF digest: `plans/reports/researcher-260416-2312-deepseek-solo-platform.md` (sec 4, 7)
- Scout reuse: `plans/reports/scout-260416-2312-raas-reuse-surface.md` (BUILD-NEW #5)

## Overview

- Priority: P1
- Status: pending
- Brief: Egress proxy for all agent-originating outbound calls. Match payloads against DLP pattern list (BYOK keys, subscriber PII, position data). Redact or block. Full audit log with hash-chained integrity.

## Key Insights

- Stateless match on patterns (regex + substring) = fast, auditable
- "Persistent leak detection" deferred — needs ML classifier, YAGNI for MVP
- Every Polymarket/CEX API call flows through IronClaw; non-negotiable
- Hash-chain audit = tamper-evident without blockchain overhead (KISS)

## Requirements

**Functional:**
- Intercept `fetch` at host layer (monkey-patch or fetch wrapper)
- Match payload + URL + headers vs pattern set (regex list from D1 table)
- Actions: `allow`, `redact`, `block`, `alert`
- Log every call: subscriber, URL, action, matched-pattern, payload-hash
- Hash-chain: `row.hash = sha256(prev.hash + row.data)`
- Admin UI: view blocked calls, add patterns

**Non-functional:**
- < 5ms overhead per call
- 10k calls/sec throughput on Worker edge
- Audit retention: 90 days D1, then archive to R2

## Architecture

```
agent code ──> ironclaw-fetch-proxy ──> pattern-matcher
                                          │
                                          ├─ allow ──> real fetch ──> log
                                          ├─ redact ─> mutate body ──> fetch ──> log
                                          ├─ block ──> throw + log + alert
```

## Related Code Files

**Create:**
- `src/ironclaw/ironclaw-fetch-proxy.ts` (~180 LOC)
- `src/ironclaw/dlp-pattern-registry.ts` (~120 LOC)
- `src/ironclaw/dlp-action-dispatcher.ts` (~100 LOC)
- `src/ironclaw/dlp-payload-redactor.ts` (~120 LOC)
- `src/ironclaw/dlp-alert-emitter.ts` (~80 LOC)
- `src/ironclaw/index.ts` (~40 LOC barrel)
- `src/audit/dlp-outbound-recorder.ts` (~150 LOC)
- `src/audit/dlp-pattern-matcher.ts` (~150 LOC)
- `src/audit/dlp-hash-chain.ts` (~100 LOC)
- `src/db/migrations/012_ironclaw_audit.sql`
- `src/ironclaw/__tests__/ironclaw-fetch-proxy.test.ts`
- `src/audit/__tests__/dlp-hash-chain.test.ts`

**Modify:**
- `src/execution/order-executor.ts` — route outbound through proxy (1-line import swap)
- `src/data/sentiment-feed.ts` — same

## Implementation Steps

1. Migration `012_ironclaw_audit.sql` (tables: `dlp_patterns`, `dlp_audit_log` with hash-chain cols)
2. Build `dlp-pattern-registry.ts` (load from D1, cache 60s)
3. Build `dlp-pattern-matcher.ts` (regex + substring engine)
4. Build `dlp-payload-redactor.ts` (replace matched substrings with `[REDACTED:pattern-id]`)
5. Build `dlp-action-dispatcher.ts` (map pattern → action)
6. Build `dlp-hash-chain.ts` (prev-hash lookup + new-row sign)
7. Build `dlp-outbound-recorder.ts` (persist audit row with chained hash)
8. Build `dlp-alert-emitter.ts` (webhook/Telegram on block)
9. Build `ironclaw-fetch-proxy.ts` (wraps global `fetch` with above pipeline)
10. Seed pattern table with defaults: API keys (sk-*, pk-*), Ethereum privkeys, subscriber emails
11. Integration test: call `fetch` with secret → verify blocked + logged with correct chain
12. Modify `order-executor.ts` and `sentiment-feed.ts` to import proxy

## Todo List

- [ ] Migration 012 applied + pattern seed data
- [ ] `dlp-pattern-registry.ts` + test
- [ ] `dlp-pattern-matcher.ts` + test (regex + false-positive cases)
- [ ] `dlp-payload-redactor.ts` + test
- [ ] `dlp-action-dispatcher.ts` + test
- [ ] `dlp-hash-chain.ts` + test (tamper detection)
- [ ] `dlp-outbound-recorder.ts` + test
- [ ] `dlp-alert-emitter.ts` + test
- [ ] `ironclaw-fetch-proxy.ts` + integration test
- [ ] `order-executor.ts` patched to use proxy
- [ ] `sentiment-feed.ts` patched to use proxy

## Success Criteria

- `bun test src/ironclaw src/audit` green
- Secret leak simulation → blocked + chained row written
- Chain verification: tampering any row breaks chain verify
- < 5ms proxy overhead measured
- No `any` / `@ts-ignore`

## Risk Assessment

- **R1:** Over-aggressive pattern blocks legit calls → mitigate: dry-run mode first, metrics-only for 48h
- **R2:** CF Workers `fetch` monkey-patch fragile → use module-level export shim instead
- **R3:** D1 write-heavy audit → batch writes every 100 rows or 1s
- **R4:** Hash chain write contention across Workers → use `INSERT ... RETURNING hash` serialized via D1 session

## Security Considerations

- DLP rules themselves are sensitive (reveal what's tracked) → admin-only read
- Hash chain anchored daily to R2 immutable object
- Alert webhook via HMAC-signed payloads only

## Next Steps

- Phase 06 surfaces blocked-call count per subscriber in dashboard
- Post-MVP: ML classifier for semantic leak detection
