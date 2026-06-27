# Phase 01 — Citadel Protocol MVP (Attestation + BYOK KMS Wrap)

**File ownership:** `src/citadel/**`, `src/lib/byok-key-custody.ts`, `src/lib/byok-kms-wrap.ts`, `src/db/migrations/010_citadel_*.sql`

## Context Links

- PDF digest: `plans/reports/researcher-260416-2312-deepseek-solo-platform.md` (sec 4, 7)
- Scout reuse: `plans/reports/scout-260416-2312-raas-reuse-surface.md` (sec 6 BYOK gap)
- Existing stubs: `src/lib/license-key-crypto.ts`, `src/workers/crypto-utils.ts`

## Overview

- Priority: P1
- Status: pending
- Brief: Ship MVP attestation + BYOK key custody layer. Hardware TEE (SGX/TDX) mocked in dev via **simulation mode**; real quote validation deferred to D2. Focus: DID-based binding + AES-256-GCM key wrap so subscriber API keys never sit in plaintext.

## Key Insights

- PDF warns SGX/TDX hardware coupling = biggest risk. Simulation-mode fallback is acceptable for enterprise demo.
- Existing `src/lib/license-key-crypto.ts` crypto primitive reusable — don't rebuild AES layer.
- "Zero secret storage" = platform holds only KEK; subscriber holds DEK in their vault / HSM.
- DID binding = license-key → subscriber-DID → attested-agent-hash.

## Requirements

**Functional:**
- Generate DID per subscriber at onboarding
- Wrap subscriber BYOK secrets with platform KEK (envelope encryption)
- Verify attestation quote (simulation stub — returns signed JWT with measurement hash)
- Record attestation events to `citadel_attestations` table
- CLI: `bun citadel:attest --subscriber=<id>` → returns signed attestation

**Non-functional:**
- AES-256-GCM for DEK, RSA-4096 or Ed25519 for KEK
- Attestation verify latency < 200ms
- No plaintext keys in D1 / KV / logs

## Architecture

```
Subscriber API key (plaintext)
  ─> DEK (random AES-256)        [lives in subscriber browser / vault]
  ─> wrap(KEK, DEK)                [KEK held by platform, rotatable]
  ─> store wrapped-DEK + DID + measurement-hash in D1
```

## Related Code Files

**Create:**
- `src/citadel/attestation-verifier.ts` (~120 LOC)
- `src/citadel/did-binder.ts` (~80 LOC)
- `src/citadel/measurement-hasher.ts` (~60 LOC)
- `src/citadel/quote-simulator.ts` (~100 LOC) — dev-only stub
- `src/citadel/index.ts` (~40 LOC barrel)
- `src/lib/byok-key-custody.ts` (~150 LOC)
- `src/lib/byok-kms-wrap.ts` (~120 LOC)
- `src/db/migrations/010_citadel_attestations.sql`
- `src/citadel/__tests__/attestation-verifier.test.ts`
- `src/citadel/__tests__/byok-kms-wrap.test.ts`

**Modify:**
- `src/billing/onboarding-service.ts` — wire DID creation on subscriber signup
- `src/db/schema.sql` — append `citadel_attestations`, `byok_keys_wrapped` tables

**Do NOT touch:** `src/lib/license-key-crypto.ts` (stable; reuse its AES helpers)

## Implementation Steps

1. Write migration `010_citadel_attestations.sql` (tables: `citadel_attestations`, `byok_keys_wrapped`, `subscriber_dids`)
2. Build `measurement-hasher.ts` (SHA-256 of agent code blob)
3. Build `did-binder.ts` (generate did:key style DID from Ed25519 pubkey)
4. Build `quote-simulator.ts` (signed JWT w/ measurement + DID + timestamp)
5. Build `attestation-verifier.ts` (verify JWT sig + measurement match + freshness)
6. Build `byok-kms-wrap.ts` (envelope: generate DEK, wrap w/ KEK, return ciphertext)
7. Build `byok-key-custody.ts` (orchestrate: subscriber supplies key → DEK → wrap → persist)
8. Wire `onboarding-service.ts` to call `did-binder` + `byok-key-custody` on new subscriber
9. Unit tests: round-trip wrap/unwrap, attestation verify happy + tampered paths
10. CLI command `bun citadel:attest` for ops

## Todo List

- [ ] Migration 010 written + applied to D1 dev
- [ ] `attestation-verifier.ts` + test
- [ ] `did-binder.ts` + test
- [ ] `measurement-hasher.ts` + test
- [ ] `quote-simulator.ts` + test
- [ ] `byok-kms-wrap.ts` + test (round-trip)
- [ ] `byok-key-custody.ts` + test
- [ ] `onboarding-service.ts` integration patch
- [ ] `src/citadel/index.ts` barrel export
- [ ] CLI `citadel:attest` registered in `src/cli/`

## Success Criteria

- `bun test src/citadel` green
- `bun test src/lib/byok-*` green
- Manual: create subscriber → DID issued → BYOK stored wrapped → attestation JWT verifies
- 0 plaintext key strings in D1 on inspection
- No `any` / `@ts-ignore`

## Risk Assessment

- **R1:** Simulation mode mistaken for real TEE in prod → mitigate: env flag `CITADEL_MODE=simulation|sgx|tdx`, prod refuses simulation
- **R2:** KEK rotation UX unclear (PDF open Q #2) → mitigate: KEK versioning column; rotation = new version, lazy re-wrap on access
- **R3:** DID spec drift — stick to did:key (simplest, no registry needed)

## Security Considerations

- KEK stored in Cloudflare Secret or env, never in code
- Wrapped DEK at rest (D1) + in transit (mTLS once K8s — MVP: HTTPS only)
- Audit log every unwrap (feeds Phase 03 IronClaw)

## Next Steps

- Phase 06 (Subscriber P&L) consumes attestation ID per trade event
- Phase 03 (IronClaw) subscribes to unwrap-audit stream
- D2 roadmap: replace `quote-simulator.ts` with Intel PCCS integration
