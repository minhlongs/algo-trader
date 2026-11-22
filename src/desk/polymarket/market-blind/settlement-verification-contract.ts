import { id as keccak256Utf8 } from 'ethers';
import { z } from 'zod';

/**
 * Five-stage settlement provenance classification.
 * Only `SETTLEMENT_EMPIRICALLY_ELIGIBLE` may enter empirical IC OOS denominators.
 */
export type SettlementVerificationStage =
  | 'SETTLEMENT_CLAIMED'
  | 'SETTLEMENT_SCHEMA_VALID'
  | 'SETTLEMENT_CHAIN_VERIFIED'
  | 'SETTLEMENT_FINALIZED'
  | 'SETTLEMENT_EMPIRICALLY_ELIGIBLE';

export const POLYGON_POS_CHAIN_ID = 137;
export const POLYGON_POS_NETWORK = 'polygon-pos' as const;
/** Canonical Gnosis Conditional Tokens Framework contract on Polygon PoS. */
export const CANONICAL_POLYGON_CTF_CONTRACT = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
/** Authoritative CTF market resolution event (distinct from CTF Exchange OrderFilled). */
export const CONDITION_RESOLUTION_EVENT_SIGNATURE =
  'ConditionResolution(bytes32,address,bytes32,uint256,uint256[])';
/** Keccak-256 topic0 of ConditionResolution(bytes32,address,bytes32,uint256,uint256[]). */
export const CONDITION_RESOLUTION_TOPIC0 = keccak256Utf8(CONDITION_RESOLUTION_EVENT_SIGNATURE).toLowerCase();
export const SETTLEMENT_VERIFICATION_RECEIPT_VERSION = 1 as const;

const identifier = z.string().trim().min(1);
const timestamp = z.number().int().positive().safe();
const hexBytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const hexAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export interface SettlementVerificationReceiptBody {
  readonly version: 1;
  readonly network: 'polygon-pos';
  readonly chainId: number;
  readonly verifierId: string;
  readonly verifierVersion: string;
  readonly contractAddress: string;
  readonly txHash: string;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly blockTimestampMs: number;
  readonly eventSignature: string;
  readonly logIndex: number;
  readonly conditionId: string;
  readonly oracleAddress: string;
  readonly ctfQuestionId: string;
  readonly marketId: string;
  readonly eventId?: string;
  readonly finalityStatus: 'FINALIZED' | 'CORRECTED';
  readonly correctionReason?: string;
  readonly supersedesReceiptDigest?: string;
  readonly payoutNumerators: readonly [number, number];
  readonly verifiedConfirmations: number;
  readonly verifiedAtMs: number;
}

export interface SettlementVerificationReceipt extends SettlementVerificationReceiptBody {
  readonly canonicalPayloadDigest: string;
  readonly signatureAlgorithm: 'ed25519';
  readonly signature: string;
}

export const settlementVerificationReceiptSchema = z.object({
  version: z.literal(1),
  network: z.literal('polygon-pos'),
  chainId: z.number().int().positive().safe(),
  verifierId: identifier,
  verifierVersion: identifier,
  contractAddress: hexAddress,
  txHash: hexBytes32,
  blockNumber: z.number().int().positive().safe(),
  blockHash: hexBytes32,
  blockTimestampMs: timestamp,
  eventSignature: identifier,
  logIndex: z.number().int().nonnegative().safe(),
  conditionId: hexBytes32,
  oracleAddress: hexAddress,
  ctfQuestionId: hexBytes32,
  marketId: identifier,
  eventId: identifier.optional(),
  finalityStatus: z.enum(['FINALIZED', 'CORRECTED']),
  correctionReason: identifier.optional(),
  supersedesReceiptDigest: sha256Hex.optional(),
  payoutNumerators: z.tuple([z.number().int().nonnegative().safe(), z.number().int().nonnegative().safe()]),
  verifiedConfirmations: z.number().int().nonnegative().safe(),
  verifiedAtMs: timestamp,
  canonicalPayloadDigest: sha256Hex,
  signatureAlgorithm: z.literal('ed25519'),
  signature: z.string().trim().min(16),
}).strict();

export interface TrustedSettlementVerifierAuthority {
  readonly verifierId: string;
  readonly verifierVersion: string;
  readonly publicKeyPem: string;
  readonly status: 'ACTIVE' | 'REVOKED';
  readonly validFromMs: number;
  readonly validUntilMs: number;
}

export interface TrustedSettlementVerifierRegistry {
  readonly authorities: readonly TrustedSettlementVerifierAuthority[];
  readonly evaluatedAtMs?: number;
}

export const trustedSettlementVerifierAuthoritySchema = z.object({
  verifierId: identifier,
  verifierVersion: identifier,
  publicKeyPem: z.string().includes('BEGIN PUBLIC KEY'),
  status: z.enum(['ACTIVE', 'REVOKED']),
  validFromMs: timestamp,
  validUntilMs: timestamp,
}).strict();

export const trustedSettlementVerifierRegistrySchema = z.object({
  authorities: z.array(trustedSettlementVerifierAuthoritySchema).min(1),
  evaluatedAtMs: timestamp.optional(),
}).strict();

export {
  computeCanonicalReceiptDigest,
  signSettlementVerificationReceipt,
  verifySettlementVerificationReceipt,
  type ReceiptVerificationResult,
} from './settlement-receipt-crypto';
