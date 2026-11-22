import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import {
  settlementVerificationReceiptSchema,
  type SettlementVerificationReceipt,
  type SettlementVerificationReceiptBody,
  type TrustedSettlementVerifierRegistry,
} from './settlement-verification-contract';

export function computeCanonicalReceiptDigest(body: SettlementVerificationReceiptBody): string {
  const canonical = [
    body.version,
    body.network,
    body.chainId,
    body.verifierId,
    body.verifierVersion,
    body.contractAddress.toLowerCase(),
    body.txHash.toLowerCase(),
    body.blockNumber,
    body.blockHash.toLowerCase(),
    body.blockTimestampMs,
    body.eventSignature,
    body.logIndex,
    body.conditionId.toLowerCase(),
    body.oracleAddress.toLowerCase(),
    body.ctfQuestionId.toLowerCase(),
    body.marketId,
    body.eventId ?? null,
    body.finalityStatus,
    body.correctionReason ?? null,
    body.supersedesReceiptDigest ?? null,
    [body.payoutNumerators[0], body.payoutNumerators[1]],
    body.verifiedConfirmations,
    body.verifiedAtMs,
  ];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function signSettlementVerificationReceipt(
  body: SettlementVerificationReceiptBody,
  privateKeyPem: string,
): SettlementVerificationReceipt {
  const canonicalPayloadDigest = computeCanonicalReceiptDigest(body);
  const key = createPrivateKey(privateKeyPem);
  const signature = cryptoSign(null, Buffer.from(canonicalPayloadDigest, 'utf8'), key).toString('base64');
  return Object.freeze({
    ...body,
    payoutNumerators: Object.freeze([body.payoutNumerators[0], body.payoutNumerators[1]] as [number, number]),
    canonicalPayloadDigest,
    signatureAlgorithm: 'ed25519',
    signature,
  });
}

export interface ReceiptVerificationResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export function verifySettlementVerificationReceipt(
  receipt: SettlementVerificationReceipt,
  registry: TrustedSettlementVerifierRegistry,
  evaluatedAtMs?: number,
): ReceiptVerificationResult {
  const parsed = settlementVerificationReceiptSchema.safeParse(receipt);
  if (!parsed.success) {
    return { ok: false, reason: 'RECEIPT_SCHEMA_INVALID' };
  }
  const r = parsed.data;
  const expectedDigest = computeCanonicalReceiptDigest({
    version: r.version,
    network: r.network,
    chainId: r.chainId,
    verifierId: r.verifierId,
    verifierVersion: r.verifierVersion,
    contractAddress: r.contractAddress,
    txHash: r.txHash,
    blockNumber: r.blockNumber,
    blockHash: r.blockHash,
    blockTimestampMs: r.blockTimestampMs,
    eventSignature: r.eventSignature,
    logIndex: r.logIndex,
    conditionId: r.conditionId,
    oracleAddress: r.oracleAddress,
    ctfQuestionId: r.ctfQuestionId,
    marketId: r.marketId,
    eventId: r.eventId,
    finalityStatus: r.finalityStatus,
    correctionReason: r.correctionReason,
    supersedesReceiptDigest: r.supersedesReceiptDigest,
    payoutNumerators: r.payoutNumerators,
    verifiedConfirmations: r.verifiedConfirmations,
    verifiedAtMs: r.verifiedAtMs,
  });
  if (r.canonicalPayloadDigest !== expectedDigest) {
    return { ok: false, reason: 'RECEIPT_DIGEST_TAMPERED' };
  }

  const matchingAuthorities = registry.authorities.filter(
    (a) => a.verifierId === r.verifierId && a.verifierVersion === r.verifierVersion,
  );
  if (matchingAuthorities.length === 0) {
    return { ok: false, reason: 'UNKNOWN_VERIFIER_AUTHORITY' };
  }
  if (matchingAuthorities.some((a) => a.status !== 'ACTIVE')) {
    return { ok: false, reason: 'REVOKED_VERIFIER_AUTHORITY' };
  }
  if (matchingAuthorities.length > 1) {
    return { ok: false, reason: 'AMBIGUOUS_VERIFIER_AUTHORITY' };
  }
  const authority = matchingAuthorities[0]!;
  const checkTimeMs = evaluatedAtMs ?? registry.evaluatedAtMs ?? Date.now();
  if (r.verifiedAtMs < authority.validFromMs || r.verifiedAtMs > authority.validUntilMs
    || checkTimeMs < authority.validFromMs || checkTimeMs > authority.validUntilMs) {
    return { ok: false, reason: 'EXPIRED_VERIFIER_AUTHORITY' };
  }
  try {
    const publicKey = createPublicKey(authority.publicKeyPem);
    const sigBytes = Buffer.from(r.signature, 'base64');
    const valid = cryptoVerify(null, Buffer.from(r.canonicalPayloadDigest, 'utf8'), publicKey, sigBytes);
    if (!valid) {
      return { ok: false, reason: 'INVALID_RECEIPT_SIGNATURE' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'INVALID_RECEIPT_SIGNATURE' };
  }
}
