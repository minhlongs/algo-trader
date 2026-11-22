# POLY-G8.6 / POLY-G8.7 Track E — Authoritative Resolution & Settlement Trust Boundary

**Date:** 2026-11-22  
**Scope:** `src/desk/polymarket/market-blind/`, `src/desk/polymarket/ic-evidence-loader.ts`, `scripts/poly-market-blind-logger.ts`  
**Code Status:** **Offline Settlement-Verification Boundary Implemented in Draft PR `#292` (`fix/poly-g8-6-settlement-provenance`) — Not Merged**  
**Empirical Gate Status:** `SETTLEMENT_CHAIN_VERIFIED = HOLD` (offline fixtures only; zero live Polygon RPC calls executed) | `EMPIRICAL_OOS = INSUFFICIENT_DATA` | `w_skill = 0`

---

## E1. Trust Gaps Identified & Reproduced

1. **Baseline `87c8db9a` Gap:** `resolutionSchema` recorded zero settlement provenance or finality fields, allowing unverified manual/CLI resolutions to count toward `resolvedEligibleCount`.
2. **Initial PR `#292` (`0b0ba95f`) Trust Gap (Reproduced Adversarially):**
   - `hasAuthoritativeFinalSettlement()` checked only claimed JSON fields (`source === 'CTF_ONCHAIN'`, `finalityStatus === 'FINALIZED'`, hex-shaped `txHash`/`conditionId`/`payloadHash`, `confirmations >= 64`, binary `payoutNumerators`).
   - **Adversarial Reproduction (TEST_ONLY):** A synthetic ledger of 150 forecasts (`pRaw = 0.90/0.10`, 90% accuracy) paired with internally consistent but **fabricated** `CTF_ONCHAIN` JSON metadata passed `hasAuthoritativeFinalSettlement()` and returned `resolvedEligibleCount = 150`, `empiricalEligible = true`, `verdict = PASS_PROSPECTIVE_SKILL`, `w_skill = 0.35`, `unlocked = true`.
   - **Root Cause:** Schema validity of caller-supplied metadata was equated with independent on-chain settlement verification.

---

## E2. Five-Stage Offline Verification Boundary (Implemented)

Added in Draft PR `#292` (`fix/poly-g8-6-settlement-provenance`):

1. **Explicit 5-Stage Verification Taxonomy (`settlement-verification-contract.ts`):**
   - `SETTLEMENT_CLAIMED` — caller provided a resolution without schema-valid finalized on-chain provenance.
   - `SETTLEMENT_SCHEMA_VALID` — caller-supplied `SettlementProvenance` passes strict Zod validation (`verified: true` booleans and extra keys rejected), but lacks an authenticated verification receipt.
   - `SETTLEMENT_CHAIN_VERIFIED` — read-only chain verifier matched canonical Polygon PoS (`chainId = 137`) receipt, authorized CTF contract (`0x4d97dcd97ec945f40cf65f87097ace5ea0476045`), `ConditionResolution` event signature & log index, ABI-decoded payout numerators, canonical block inclusion, and market/condition/question mapping, but finality/dispute checks are not yet satisfied.
   - `SETTLEMENT_FINALIZED` — chain-verified event also cleared UMA dispute/proposal checks, verified confirmation depth (`>= 64` computed from chain head, never trusted from caller claims), block timestamp consistency, and verified follow-up receipt digest for `CORRECTED` resolutions, producing an Ed25519-signed `SettlementVerificationReceipt`.
   - `SETTLEMENT_EMPIRICALLY_ELIGIBLE` — the **only** stage counted in empirical OOS scoring; requires a non-revoked, non-expired authority in `TrustedSettlementVerifierRegistry`, valid Ed25519 signature over the canonical receipt digest, exact field binding between the signed receipt, claimed provenance, and committed forecast, and non-duplicate `(conditionId, txHash, logIndex)`.

2. **Read-Only On-Chain Verifier Interface (`settlement-chain-verifier.ts`):**
   - `ChainSettlementProvider` interface + `verifyOnChainSettlement()` validates chain ID (`137`), transaction receipt presence & `status === 1`, canonical block hash & reorg detection, block/commit/resolved timestamp consistency, authorized CTF contract, `ConditionResolution` topic0 (`0xb44d84d3289691f71497564b85d4233648d9dbae8cbdbb4329f301c3a0185894`, distinct from CTF Exchange `OrderFilled`), exact `logIndex`, `ethers.Interface` ABI decoding, binary payout vector, market/condition/question/oracle mapping, UMA dispute status (`PROPOSED`/`DISPUTED`/`CORRECTED` requiring `supersedesReceiptDigest`), and chain-head-computed confirmation depth (`>= 64`).
   - **Offline-Only Execution:** All tests run against deterministic mock `ChainSettlementProvider` fixtures. Zero live Polygon RPC calls or market-data ingestion are executed.

3. **Versioned Signed Receipt & Isolated Authority Registry (`settlement-verification-contract.ts`, `market-blind-oos-report.ts`):**
   - `SettlementVerificationReceipt` binds network, chain ID, verifier ID/version, contract address, txHash, block number/hash/timestamp, event signature, log index, condition/oracle/question/market/event IDs, finality status, payout numerators, verified confirmation depth, verification timestamp, canonical SHA-256 payload digest, and Ed25519 signature.
   - Signing private keys (`SettlementReceiptSigner`) are strictly excluded from CLI configuration and scorer inputs; `evaluateProspectiveOosReport`, `loadICEvidenceForScorecard`, and `scripts/poly-market-blind-logger.ts status --verifier-registry <path>` accept **public-key-only** `TrustedSettlementVerifierRegistry` objects (`ACTIVE` / `REVOKED`, `validFromMs` / `validUntilMs`).
   - In `mode === 'empirical'`, missing `settlementVerifierRegistry` fails closed (`SETTLEMENT_VERIFIER_AUTHORITY_REQUIRED`), untrusted/revoked/expired/tampered/unsigned/duplicate receipts are excluded (`resolvedEligibleCount = 0`, `w_skill = 0`), and `diagnostic` mode remains available for local debugging without empirical eligibility.

---

## E3. Explicit Threat-Model & Solo-Operator Limitations

- **No Live On-Chain Verification Performed:** This PR implements and tests the offline verification boundary and fail-closed scorer. **No live Polygon RPC provider is wired or executed.** Until an authorized, independently operated chain verifier produces real receipts, live empirical OOS remains `INSUFFICIENT_DATA` and `w_skill = 0`.
- **Solo-Operator Key-Custody Limitation:** Ed25519 receipt authentication prevents unauthenticated CLI JSON payloads from impersonating verified on-chain settlements. However, **if a single operator controls both the verifier signing private key and the ledger / verifier-registry storage**, that operator could still self-sign fabricated receipts for a registry they control. Genuine institutional independence requires separating verifier key custody (e.g., HSM / external attestation service) and retaining both the verifier public-key registry and ledger checkpoint outside the operator's write boundary.

---

## E4. Offline Verification Results

- Targeted suites (`market-blind-settlement-provenance.test.ts`, `market-blind-empirical-eligibility.test.ts`, `market-blind-logger-cli.test.ts`, `market-blind-prospective-pipeline.test.ts`, `ic-evidence-loader.test.ts`): **5/5 files, 34/34 tests passed**, including the TEST_ONLY 150-record forged-CTF attack (`resolvedEligibleCount = 0`, `w_skill = 0`), the 150-record untrusted-keypair attack, and all 20 chain/receipt/registry rejection vectors.
- Full Polymarket suite (`tests/polymarket/`): **49/49 test files, 425/425 tests passed**.
- `npx tsc --noEmit`: **0 errors**.
- `npm run lint`: **0 errors**, **0 warnings** in modified files.
- Zero live Polymarket API calls, zero live Polygon RPC calls, `LIVE_TRADING_ENABLED = false`, `w_skill = 0`, `IC_DAY_0 = null`.
