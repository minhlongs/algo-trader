/**
 * Polymarket CLOB V2 — Offline EIP-712 Signature, Domain, Nonce & Session Verifier (#272).
 */

import { ethers } from 'ethers';
import type { ClobV2ExchangeConfig } from './clob-v2-venue-constants';
import {
  CLOB_V2_ORDER_FIELD_TYPES,
  buildClobV2TypedData,
  type ClobV2SignedOrder,
  type ClobV2SignedOrderMessage,
} from './clob-v2-order-signing';

export type ClobV2VerifyFailureCode =
  | 'INVALID_SIGNATURE'
  | 'WRONG_SIGNER'
  | 'WRONG_NONCE'
  | 'EXPIRED_ORDER'
  | 'SESSION_EXPIRED';

export type ClobV2VerifyResult =
  | { ok: true; recoveredSigner: string }
  | { ok: false; code: ClobV2VerifyFailureCode; detail: string };

const ORDER_TYPES: Record<string, ethers.TypedDataField[]> = {
  Order: CLOB_V2_ORDER_FIELD_TYPES,
};

function signedMessagesEqual(
  actual: ClobV2SignedOrderMessage,
  expected: ClobV2SignedOrderMessage,
): boolean {
  return (
    actual.salt === expected.salt &&
    actual.maker.toLowerCase() === expected.maker.toLowerCase() &&
    actual.signer.toLowerCase() === expected.signer.toLowerCase() &&
    actual.tokenId === expected.tokenId &&
    actual.makerAmount === expected.makerAmount &&
    actual.takerAmount === expected.takerAmount &&
    actual.side === expected.side &&
    actual.signatureType === expected.signatureType &&
    actual.timestamp === expected.timestamp &&
    actual.metadata.toLowerCase() === expected.metadata.toLowerCase() &&
    actual.builder.toLowerCase() === expected.builder.toLowerCase()
  );
}

/** Offline signature, chain/domain, message/hash parity, signer, nonce-floor, and expiry verifier (#272). */
export function verifyClobV2SignedOrder(
  signed: ClobV2SignedOrder,
  expectedCfg: ClobV2ExchangeConfig,
  rules: {
    nowSec?: number;
    expectedMinNonce?: bigint;
    sessionExpiresAtSec?: number;
  } = {},
): ClobV2VerifyResult {
  const nowSec = rules.nowSec ?? Math.floor(Date.now() / 1000);
  if (rules.sessionExpiresAtSec !== undefined && nowSec >= rules.sessionExpiresAtSec) {
    return {
      ok: false,
      code: 'SESSION_EXPIRED',
      detail: `Delegated session expired at ${rules.sessionExpiresAtSec} (now=${nowSec})`,
    };
  }
  const exp = signed.order.expiration ?? 0;
  if (exp > 0 && nowSec >= exp) {
    return {
      ok: false,
      code: 'EXPIRED_ORDER',
      detail: `Order expiration ${exp} is not in the future (now=${nowSec})`,
    };
  }
  if (rules.expectedMinNonce !== undefined) {
    const rawNonce = signed.order.nonce ?? '0';
    if (!/^\d+$/.test(rawNonce)) {
      return {
        ok: false,
        code: 'WRONG_NONCE',
        detail: `Malformed non-numeric order nonce: ${rawNonce}`,
      };
    }
    const orderNonce = BigInt(rawNonce);
    if (orderNonce < rules.expectedMinNonce) {
      return {
        ok: false,
        code: 'WRONG_NONCE',
        detail: `Order nonce ${orderNonce} is below minimum required ${rules.expectedMinNonce}`,
      };
    }
  }
  const resolvedCfg: ClobV2ExchangeConfig = {
    ...expectedCfg,
    maker: expectedCfg.maker ?? signed.maker,
    signer: expectedCfg.signer ?? signed.signer,
  };
  let typed: ReturnType<typeof buildClobV2TypedData>;
  try {
    typed = buildClobV2TypedData(signed.order, resolvedCfg);
  } catch (err) {
    return {
      ok: false,
      code: 'INVALID_SIGNATURE',
      detail: err instanceof Error ? err.message : 'Invalid EIP-712 domain or address',
    };
  }
  if (!signedMessagesEqual(signed.signedMessage, typed.message)) {
    return {
      ok: false,
      code: 'INVALID_SIGNATURE',
      detail: 'signedMessage fields diverge from canonical EIP-712 Order struct',
    };
  }
  const expectedHash = ethers.TypedDataEncoder.hash(typed.domain, ORDER_TYPES, typed.message);
  if (signed.orderHash.toLowerCase() !== expectedHash.toLowerCase()) {
    return {
      ok: false,
      code: 'INVALID_SIGNATURE',
      detail: 'orderHash diverges from canonical EIP-712 TypedDataEncoder digest',
    };
  }
  let recovered: string;
  try {
    recovered = ethers.verifyTypedData(typed.domain, ORDER_TYPES, typed.message, signed.signature);
  } catch (err) {
    return {
      ok: false,
      code: 'INVALID_SIGNATURE',
      detail: err instanceof Error ? err.message : 'Malformed ECDSA signature',
    };
  }
  if (recovered.toLowerCase() !== typed.message.signer.toLowerCase()) {
    return {
      ok: false,
      code: 'WRONG_SIGNER',
      detail: `Recovered ${recovered} != expected signer ${typed.message.signer}`,
    };
  }
  return { ok: true, recoveredSigner: recovered };
}
