import {
  CANONICAL_POLYGON_CTF_CONTRACT,
  CONDITION_RESOLUTION_EVENT_SIGNATURE,
  POLYGON_POS_CHAIN_ID,
  POLYGON_POS_NETWORK,
  SETTLEMENT_VERIFICATION_RECEIPT_VERSION,
  signSettlementVerificationReceipt,
  type SettlementVerificationReceipt,
  type SettlementVerificationReceiptBody,
  type SettlementVerificationStage,
} from './settlement-verification-contract';
import { decodeConditionResolutionLog, type ChainReceiptLog } from './settlement-chain-log-decoder';

export type { ChainReceiptLog } from './settlement-chain-log-decoder';

export interface ChainBlockHeader {
  readonly number: number;
  readonly hash: string;
  readonly timestampMs: number;
}

export interface ChainTransactionReceipt {
  readonly txHash: string;
  readonly status: 0 | 1;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly logs: readonly ChainReceiptLog[];
}

export interface MarketConditionMapping {
  readonly marketId: string;
  readonly eventId?: string;
  readonly conditionId: string;
  readonly ctfQuestionId: string;
  readonly expectedOracleAddress?: string;
}

export interface UmaDisputeStatus {
  readonly state: 'NONE' | 'PROPOSED' | 'DISPUTED' | 'SETTLED' | 'CORRECTED';
  readonly settledAtMs?: number;
  readonly correctionReason?: string;
}

/**
 * Read-only chain evidence provider.
 * Offline tests supply deterministic mock fixtures; live RPC collection is intentionally out of scope.
 */
export interface ChainSettlementProvider {
  getChainId(): Promise<number>;
  getLatestBlock(): Promise<ChainBlockHeader | null>;
  getBlockByNumber(blockNumber: number): Promise<ChainBlockHeader | null>;
  getTransactionReceipt(txHash: string): Promise<ChainTransactionReceipt | null>;
  getMarketConditionMapping(marketId: string): Promise<MarketConditionMapping | null>;
  getUmaDisputeStatus(conditionId: string): Promise<UmaDisputeStatus>;
}

export interface SettlementReceiptSigner {
  readonly verifierId: string;
  readonly verifierVersion: string;
  readonly privateKeyPem: string;
}

export interface SettlementVerificationRequest {
  readonly marketId: string;
  readonly eventId?: string;
  readonly txHash: string;
  readonly logIndex: number;
  readonly expectedConditionId?: string;
  readonly expectedBlockHash?: string;
  readonly committedAtMs?: number;
  readonly resolvedAtMs?: number;
  readonly expectedPayoutNumerators?: readonly [number, number];
  readonly supersedesReceiptDigest?: string;
}

export interface SettlementVerificationOptions {
  readonly minConfirmations?: number;
  readonly allowedContracts?: readonly string[];
  readonly maxBlockTimestampDriftMs?: number;
  readonly nowMs?: () => number;
}

export type ChainSettlementVerificationResult =
  | { readonly ok: true; readonly stage: 'SETTLEMENT_FINALIZED'; readonly receipt: SettlementVerificationReceipt }
  | {
      readonly ok: false;
      readonly stage: Exclude<SettlementVerificationStage, 'SETTLEMENT_FINALIZED' | 'SETTLEMENT_EMPIRICALLY_ELIGIBLE'>;
      readonly reason: string;
    };

const DEFAULT_MIN_CONFIRMATIONS = 64;
const DEFAULT_MAX_TIMESTAMP_DRIFT_MS = 15 * 60 * 1000;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export async function verifyOnChainSettlement(
  request: SettlementVerificationRequest,
  provider: ChainSettlementProvider,
  signer: SettlementReceiptSigner,
  options: SettlementVerificationOptions = {},
): Promise<ChainSettlementVerificationResult> {
  const minConfirmations = options.minConfirmations ?? DEFAULT_MIN_CONFIRMATIONS;
  const allowedContracts = new Set((options.allowedContracts ?? [CANONICAL_POLYGON_CTF_CONTRACT]).map((a) => a.toLowerCase()));
  const maxDriftMs = options.maxBlockTimestampDriftMs ?? DEFAULT_MAX_TIMESTAMP_DRIFT_MS;
  const nowMs = options.nowMs ?? Date.now;

  const chainId = await provider.getChainId();
  if (chainId !== POLYGON_POS_CHAIN_ID) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: `WRONG_CHAIN_ID:${chainId}` };

  const txReceipt = await provider.getTransactionReceipt(request.txHash);
  if (!txReceipt) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'TX_RECEIPT_NOT_FOUND' };
  if (txReceipt.txHash.toLowerCase() !== request.txHash.toLowerCase()) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'TX_HASH_MISMATCH' };
  if (txReceipt.status !== 1) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'TX_RECEIPT_FAILED' };

  const canonicalBlock = await provider.getBlockByNumber(txReceipt.blockNumber);
  if (!canonicalBlock || canonicalBlock.number !== txReceipt.blockNumber) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'CANONICAL_BLOCK_NOT_FOUND' };
  if (canonicalBlock.hash.toLowerCase() !== txReceipt.blockHash.toLowerCase()) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'NON_CANONICAL_BLOCK_OR_REORG' };
  if (request.expectedBlockHash && canonicalBlock.hash.toLowerCase() !== request.expectedBlockHash.toLowerCase()) {
    return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'CHAIN_REORGANIZATION_DETECTED' };
  }

  const latestBlock = await provider.getLatestBlock();
  if (!latestBlock || latestBlock.number < txReceipt.blockNumber) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'CHAIN_HEAD_BEHIND_RECEIPT' };
  if (canonicalBlock.timestampMs <= 0 || canonicalBlock.timestampMs > latestBlock.timestampMs + maxDriftMs) {
    return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'INCONSISTENT_BLOCK_TIMESTAMP' };
  }
  if (request.committedAtMs !== undefined && canonicalBlock.timestampMs <= request.committedAtMs) {
    return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'BLOCK_TIMESTAMP_PRECEDES_COMMIT' };
  }
  if (request.resolvedAtMs !== undefined && Math.abs(request.resolvedAtMs - canonicalBlock.timestampMs) > maxDriftMs) {
    return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'RESOLVED_TIMESTAMP_MISMATCH' };
  }

  const log = txReceipt.logs.find((entry) => entry.logIndex === request.logIndex);
  if (!log) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'LOG_NOT_FOUND_AT_INDEX' };
  if (!allowedContracts.has(log.address.toLowerCase())) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'UNAUTHORIZED_SETTLEMENT_CONTRACT' };

  const decodedResult = decodeConditionResolutionLog(log);
  if (!decodedResult.ok) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: decodedResult.reason };
  const { conditionId: decodedConditionId, oracleAddress: decodedOracle, ctfQuestionId: decodedQuestionId, payoutNumerators } = decodedResult.decoded;

  if (request.expectedConditionId && decodedConditionId !== request.expectedConditionId.toLowerCase()) {
    return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'CONDITION_ID_MISMATCH' };
  }
  if (request.expectedPayoutNumerators && (request.expectedPayoutNumerators[0] !== payoutNumerators[0] || request.expectedPayoutNumerators[1] !== payoutNumerators[1])) {
    return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'PAYOUT_NUMERATOR_MISMATCH' };
  }

  const mapping = await provider.getMarketConditionMapping(request.marketId);
  if (!mapping || mapping.marketId !== request.marketId) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'MARKET_MAPPING_NOT_FOUND' };
  if (request.eventId && mapping.eventId && mapping.eventId !== request.eventId) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'EVENT_ID_MAPPING_MISMATCH' };
  if (mapping.conditionId.toLowerCase() !== decodedConditionId) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'MARKET_CONDITION_MAPPING_MISMATCH' };
  if (mapping.ctfQuestionId.toLowerCase() !== decodedQuestionId) return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'MARKET_QUESTION_MAPPING_MISMATCH' };
  if (mapping.expectedOracleAddress && mapping.expectedOracleAddress.toLowerCase() !== decodedOracle) {
    return { ok: false, stage: 'SETTLEMENT_SCHEMA_VALID', reason: 'ORACLE_ADDRESS_MISMATCH' };
  }

  const dispute = await provider.getUmaDisputeStatus(decodedConditionId);
  if (dispute.state === 'PROPOSED') return { ok: false, stage: 'SETTLEMENT_CHAIN_VERIFIED', reason: 'UNFINALIZED_PROPOSAL' };
  if (dispute.state === 'DISPUTED') return { ok: false, stage: 'SETTLEMENT_CHAIN_VERIFIED', reason: 'PENDING_UMA_DISPUTE' };
  if (dispute.state === 'CORRECTED' && (!dispute.correctionReason || !request.supersedesReceiptDigest || !SHA256_HEX_PATTERN.test(request.supersedesReceiptDigest))) {
    return { ok: false, stage: 'SETTLEMENT_CHAIN_VERIFIED', reason: 'CORRECTED_RESOLUTION_MISSING_VERIFIED_FOLLOWUP' };
  }

  const verifiedConfirmations = latestBlock.number - txReceipt.blockNumber + 1;
  if (verifiedConfirmations < minConfirmations) return { ok: false, stage: 'SETTLEMENT_CHAIN_VERIFIED', reason: `INSUFFICIENT_CONFIRMATIONS:${verifiedConfirmations}` };

  const verifiedAtMs = Math.max(nowMs(), canonicalBlock.timestampMs);
  const body: SettlementVerificationReceiptBody = {
    version: SETTLEMENT_VERIFICATION_RECEIPT_VERSION,
    network: POLYGON_POS_NETWORK,
    chainId,
    verifierId: signer.verifierId,
    verifierVersion: signer.verifierVersion,
    contractAddress: log.address.toLowerCase(),
    txHash: txReceipt.txHash.toLowerCase(),
    blockNumber: txReceipt.blockNumber,
    blockHash: canonicalBlock.hash.toLowerCase(),
    blockTimestampMs: canonicalBlock.timestampMs,
    eventSignature: CONDITION_RESOLUTION_EVENT_SIGNATURE,
    logIndex: log.logIndex,
    conditionId: decodedConditionId,
    oracleAddress: decodedOracle,
    ctfQuestionId: decodedQuestionId,
    marketId: mapping.marketId,
    ...(mapping.eventId ? { eventId: mapping.eventId } : {}),
    finalityStatus: dispute.state === 'CORRECTED' ? 'CORRECTED' : 'FINALIZED',
    ...(dispute.state === 'CORRECTED' && dispute.correctionReason ? { correctionReason: dispute.correctionReason } : {}),
    ...(dispute.state === 'CORRECTED' && request.supersedesReceiptDigest ? { supersedesReceiptDigest: request.supersedesReceiptDigest } : {}),
    payoutNumerators,
    verifiedConfirmations,
    verifiedAtMs,
  };
  return { ok: true, stage: 'SETTLEMENT_FINALIZED', receipt: signSettlementVerificationReceipt(body, signer.privateKeyPem) };
}
