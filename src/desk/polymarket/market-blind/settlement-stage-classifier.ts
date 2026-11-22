import {
  MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS,
  settlementProvenanceSchema,
  type MarketBlindResolutionAuditRecord,
  type ProspectiveCommitReceipt,
} from './market-blind-pipeline-contract';
import {
  CANONICAL_POLYGON_CTF_CONTRACT,
  CONDITION_RESOLUTION_EVENT_SIGNATURE,
  POLYGON_POS_CHAIN_ID,
  verifySettlementVerificationReceipt,
  type SettlementVerificationStage,
  type TrustedSettlementVerifierRegistry,
} from './settlement-verification-contract';

const MAX_BLOCK_TIMESTAMP_DRIFT_MS = 15 * 60 * 1000;

export const isSyntheticIdentifier = (value: string): boolean => /test[_ -]?only|synthetic/i.test(value);

export function hasEmpiricalMetadata(c: ProspectiveCommitReceipt): boolean {
  return !!(c.forecastId && c.researchQuestionId && c.eventId && c.marketId && c.forecastHorizonMs
    && c.provenance?.kind === 'REAL' && c.provenance.source && c.provenance.reference
    && ![c.forecastId, c.questionId, c.researchQuestionId, c.eventId, c.marketId, c.modelVersion, c.category, c.provenance.source, c.provenance.reference].some(isSyntheticIdentifier));
}

export interface SettlementStageAssessment {
  readonly stage: SettlementVerificationStage;
  readonly reason?: string;
}

/**
 * Classifies a resolution record into the 5-stage settlement verification hierarchy.
 * Only `SETTLEMENT_EMPIRICALLY_ELIGIBLE` may enter empirical IC OOS denominators.
 */
export function classifySettlementVerificationStage(
  c: ProspectiveCommitReceipt,
  r: MarketBlindResolutionAuditRecord,
  registry?: TrustedSettlementVerifierRegistry,
): SettlementStageAssessment {
  const p = r.settlementProvenance;
  if (!p) return { stage: 'SETTLEMENT_CLAIMED', reason: 'MISSING_SETTLEMENT_PROVENANCE' };
  const schemaCheck = settlementProvenanceSchema.safeParse(p);
  if (!schemaCheck.success) return { stage: 'SETTLEMENT_CLAIMED', reason: 'INVALID_SETTLEMENT_SCHEMA' };
  if (p.source === 'MANUAL_ADMIN' || p.source === 'GAMMA_API') {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: `UNTRUSTED_SOURCE:${p.source}` };
  }
  if (!c.marketId || p.marketId !== c.marketId) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'MARKET_ID_MISMATCH' };
  }
  if (c.eventId && p.eventId && p.eventId !== c.eventId) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'EVENT_ID_MISMATCH' };
  }
  if (!p.conditionId || !p.txHash || p.blockNumber === undefined || !p.payoutNumerators) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'INCOMPLETE_ONCHAIN_COORDINATES' };
  }
  if (p.observedAtMs < r.resolvedAtMs) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'OBSERVED_BEFORE_RESOLVED' };
  }
  if ([p.marketId, p.reference, ...(p.eventId ? [p.eventId] : [])].some(isSyntheticIdentifier)) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'SYNTHETIC_SETTLEMENT_REFERENCE' };
  }
  if (!p.verificationReceipt || !registry) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'MISSING_INDEPENDENT_VERIFICATION_RECEIPT' };
  }

  const sigResult = verifySettlementVerificationReceipt(p.verificationReceipt, registry);
  if (!sigResult.ok) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: sigResult.reason ?? 'UNVERIFIED_RECEIPT' };
  }

  const vr = p.verificationReceipt;
  if (vr.chainId !== POLYGON_POS_CHAIN_ID) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: `WRONG_CHAIN_ID:${vr.chainId}` };
  }
  if (vr.contractAddress.toLowerCase() !== CANONICAL_POLYGON_CTF_CONTRACT) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'UNAUTHORIZED_SETTLEMENT_CONTRACT' };
  }
  if (vr.eventSignature !== CONDITION_RESOLUTION_EVENT_SIGNATURE) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'WRONG_EVENT_SIGNATURE' };
  }
  if (vr.marketId !== c.marketId || vr.marketId !== p.marketId) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'RECEIPT_MARKET_MISMATCH' };
  }
  if (c.eventId && vr.eventId && vr.eventId !== c.eventId) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'RECEIPT_EVENT_MISMATCH' };
  }
  if (vr.conditionId.toLowerCase() !== p.conditionId.toLowerCase()
    || vr.txHash.toLowerCase() !== p.txHash.toLowerCase()
    || vr.blockNumber !== p.blockNumber) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'RECEIPT_COORDINATE_MISMATCH' };
  }
  if (vr.blockTimestampMs <= c.committedAtMs
    || c.recordedAtMs === undefined
    || vr.blockTimestampMs <= c.recordedAtMs
    || r.marketReadAtMs === null
    || r.marketReadAtMs >= vr.blockTimestampMs
    || Math.abs(r.resolvedAtMs - vr.blockTimestampMs) > MAX_BLOCK_TIMESTAMP_DRIFT_MS
    || vr.verifiedAtMs < vr.blockTimestampMs) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'RECEIPT_TIMESTAMP_INCONSISTENT' };
  }

  const [yesNum, noNum] = vr.payoutNumerators;
  const payoutMatchesOutcome = r.outcome === 1 ? (yesNum > 0 && noNum === 0) : r.outcome === 0 ? (noNum > 0 && yesNum === 0) : false;
  const payoutMatchesClaim = p.payoutNumerators[0] === yesNum && p.payoutNumerators[1] === noNum;
  if (!payoutMatchesOutcome || !payoutMatchesClaim) {
    return { stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'RECEIPT_PAYOUT_MISMATCH' };
  }

  if (p.finalityStatus !== 'FINALIZED' && p.finalityStatus !== 'CORRECTED') {
    return { stage: 'SETTLEMENT_CHAIN_VERIFIED', reason: `NON_FINAL_PROVENANCE:${p.finalityStatus}` };
  }
  if (vr.finalityStatus !== p.finalityStatus) {
    return { stage: 'SETTLEMENT_CHAIN_VERIFIED', reason: 'FINALITY_STATUS_MISMATCH' };
  }
  if (vr.finalityStatus === 'CORRECTED' && (!vr.correctionReason || !vr.supersedesReceiptDigest || !p.correctionReason)) {
    return { stage: 'SETTLEMENT_CHAIN_VERIFIED', reason: 'CORRECTED_WITHOUT_VERIFIED_FOLLOWUP' };
  }
  if (vr.verifiedConfirmations < MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS) {
    return { stage: 'SETTLEMENT_CHAIN_VERIFIED', reason: 'INSUFFICIENT_VERIFIED_CONFIRMATIONS' };
  }
  if ([vr.verifierId, vr.marketId, ...(vr.eventId ? [vr.eventId] : [])].some(isSyntheticIdentifier)) {
    return { stage: 'SETTLEMENT_FINALIZED', reason: 'SYNTHETIC_VERIFIER_METADATA' };
  }
  return { stage: 'SETTLEMENT_EMPIRICALLY_ELIGIBLE' };
}
