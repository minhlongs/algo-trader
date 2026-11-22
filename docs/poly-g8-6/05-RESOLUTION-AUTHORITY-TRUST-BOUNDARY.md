# POLY-G8.6 Track E — Authoritative Resolution & Settlement Trust Boundary

**Date:** 2026-11-22  
**Scope:** `src/desk/polymarket/market-blind/` & `scripts/poly-market-blind-logger.ts`  
**Code Status:** **Concrete Gap Remediated in Isolated Draft PR (`fix/poly-g8-6-settlement-provenance`)**  
**Empirical Gate Status:** `w_skill = 0` (locked; zero live API or RPC calls executed)

---

## E1. Concrete Gap Identified in Baseline `87c8db9a`

Inspection of `market-blind-pipeline-contract.ts`, `market-blind-prospective-pipeline.ts`, `market-blind-oos-report.ts`, and `scripts/poly-market-blind-logger.ts` at baseline `87c8db9a` confirmed a real trust-boundary gap:

- `resolutionSchema` (`market-blind-pipeline-contract.ts:60-64`) recorded only `{ entryHash, questionId, status, outcome, resolvedAtMs, marketProb, marketReadAtMs, note }` with **zero settlement provenance or finality fields**.
- `evaluateProspectiveOosReport(..., { mode: 'empirical' })` (`market-blind-oos-report.ts:47-62`) validated commit metadata (`forecastId`, `researchQuestionId`, `eventId`, `marketId`, `provenance.kind === 'REAL'`) and `recordedAtMs < resolvedAtMs`, but **never verified where the resolution came from or whether it was finalized on-chain**.
- Consequently, an operator passing `--resolved-at-ms <future-ms>` to `scripts/poly-market-blind-logger.ts resolve` could append unverified manual/CLI resolutions that counted toward `resolvedEligibleCount` and could unlock `w_skill > 0` once 150 records existed.

---

## E2. Implemented Offline Deterministic Verification Boundary

Added in branch `fix/poly-g8-6-settlement-provenance` (Draft PR — **not merged**):

1. **Typed & Schema-Validated `SettlementProvenance` (`market-blind-pipeline-contract.ts`):**
   - `source`: `'CTF_ONCHAIN' | 'UMA_ORACLE' | 'GAMMA_API' | 'MANUAL_ADMIN'`
   - `finalityStatus`: `'PROPOSED' | 'DISPUTED' | 'FINALIZED' | 'CORRECTED'`
   - `marketId`, optional `eventId`, `conditionId` (`0x` + 64 hex), `txHash` (`0x` + 64 hex), `blockNumber`, `confirmations`, `payoutNumerators` (`[yes, no]`), `observedAtMs`, `payloadHash` (64-hex SHA-256), `reference`, optional `correctionReason`.
   - Constant `MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS = 64`.
2. **Deterministic Ledger Validation (`market-blind-prospective-pipeline.ts`):**
   - Binds `settlementProvenance.marketId` (and `eventId` when present) strictly to the committed forecast's `marketId` / `eventId`.
   - Rejects `observedAtMs < resolvedAtMs` (cannot claim observation before settlement).
   - Verifies binary `payoutNumerators` match `RESOLVED_YES` (`[>0, 0]`) or `RESOLVED_NO` (`[0, >0]`); rejects ambiguous `[1, 1]` / `[0, 0]` payouts.
   - Requires `correctionReason` when `finalityStatus === 'CORRECTED'`.
   - Requires full on-chain coordinates (`conditionId`, `txHash`, `blockNumber`, `confirmations`) for `CTF_ONCHAIN`.
   - Freezes `settlementProvenance` immutably and preserves original `committedAtMs`, `recordedAtMs`, and `marketReadAtMs` across journal hydration.
3. **Fail-Closed Empirical OOS Gate (`market-blind-oos-report.ts`):**
   - In `mode === 'empirical'`, `hasAuthoritativeFinalSettlement()` **excludes** any resolution that:
     - lacks `settlementProvenance`,
     - uses `source === 'MANUAL_ADMIN'` (blocks CLI/operator timestamp forgery),
     - uses bare mutable `source === 'GAMMA_API'` without finalized on-chain CTF/UMA settlement proof,
     - is in `PROPOSED` or `DISPUTED` finality state (or `VOIDED` / `CANCELLED` / `UMA_DISPUTED` status),
     - has fewer than `MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS` (`64`) confirmations,
     - contains synthetic/test-only provenance references, or
     - mismatches `marketId`, `eventId`, or `payoutNumerators`.
   - Excluded records emit `'UNVERIFIED_OR_NON_FINAL_SETTLEMENT_EXCLUDED'` in `eligibilityReasons` and never increment `resolvedEligibleCount` or unlock `w_skill > 0`.
   - `diagnostic` mode preserves local debugging compatibility while always keeping `empiricalEligible = false` and `resolvedEligibleCount = 0`.
4. **CLI Support (`scripts/poly-market-blind-logger.ts`):**
   - Added `--settlement-provenance <json-path>` on `resolve`, validated against `settlementProvenanceSchema`.

---

## E3. Offline Verification Results

- `npx vitest run tests/polymarket/market-blind-*.test.ts tests/polymarket/ic-evidence-loader.test.ts`: **9/9 test files, 70/70 tests passed** (including new `tests/polymarket/market-blind-settlement-provenance.test.ts`).
- `npx tsc --noEmit`: **0 errors**.
- `npm run lint`: **0 errors**, **0 new warnings** in modified files.
- Zero live Polymarket API calls, zero live RPC calls, `w_skill = 0`.
