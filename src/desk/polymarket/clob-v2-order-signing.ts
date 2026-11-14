/**
 * Polymarket CLOB V2 — ExchangeV3 EIP-712 order signing.
 *
 * V1 signed against `CTF Exchange` v1 at the old exchange address. The V2 cutover
 * moved the domain to ExchangeV3 (`version: "3"`) and the deposit-wallet
 * signature scheme to Poly1271, so a V1 signature is not accepted any more.
 *
 * The report does not publish the ExchangeV3 verifying-contract address, so it is
 * an injectable config rather than a constant here: a guessed address would
 * produce signatures the exchange silently rejects.
 *
 * NOT VERIFIED AGAINST THE LIVE ENDPOINT — signed against a fake key in tests.
 */

import { ethers } from 'ethers';
import {
  EXCHANGE_V3_DOMAIN_NAME,
  EXCHANGE_V3_DOMAIN_VERSION,
  POLYGON_CHAIN_ID,
  POLY_1271_SIGNATURE_TYPE,
  V1_CTF_EXCHANGE_ADDRESS,
  ZERO_BUILDER_CODE,
  type ClobV2ExchangeConfig,
  type ClobV2OrderIntent,
} from './clob-v2-venue-constants';

const ORDER_FIELD_TYPES: ethers.TypedDataField[] = [
  { name: 'tokenId', type: 'uint256' },
  { name: 'makerAmount', type: 'uint256' },
  { name: 'takerAmount', type: 'uint256' },
  { name: 'expiration', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'feeRateBps', type: 'uint256' },
  { name: 'side', type: 'uint8' },
  { name: 'signatureType', type: 'uint8' },
  { name: 'builder', type: 'bytes32' },
];

const ORDER_TYPES: Record<string, ethers.TypedDataField[]> = { Order: ORDER_FIELD_TYPES };

export interface ClobV2SignedOrder {
  order: ClobV2OrderIntent;
  signature: string;
  maker: string;
  orderHash: string;
}

/** Build the ExchangeV3 EIP-712 payload. Exported so tests can pin the domain. */
export function buildClobV2TypedData(intent: ClobV2OrderIntent, cfg: ClobV2ExchangeConfig) {
  const verifyingContract = ethers.getAddress(cfg.verifyingContract);
  if (verifyingContract.toLowerCase() === V1_CTF_EXCHANGE_ADDRESS.toLowerCase()) {
    throw new Error(
      'ExchangeV3 verifying contract required; the V1 exchange was retired 2026-04-28',
    );
  }
  const domain = {
    name: EXCHANGE_V3_DOMAIN_NAME,
    version: EXCHANGE_V3_DOMAIN_VERSION,
    chainId: cfg.chainId ?? POLYGON_CHAIN_ID,
    verifyingContract,
  };
  const sharesRaw = Math.round(intent.size * 1e6).toString();
  const collateralRaw = Math.round(intent.size * intent.price * 1e6).toString();
  const isBuy = intent.side === 'BUY';
  const message = {
    tokenId: intent.tokenId,
    // CTF Exchange Order: BUY offers collateral (`makerAmount`) for outcome shares (`takerAmount`);
    // SELL offers outcome shares (`makerAmount`) for collateral (`takerAmount`).
    makerAmount: isBuy ? collateralRaw : sharesRaw,
    takerAmount: isBuy ? sharesRaw : collateralRaw,
    expiration: (intent.expiration ?? 0).toString(),
    nonce: intent.nonce ?? '0',
    // The fee is charged by the venue from its own published schedule; the signed
    // order carries no fee field that could override it.
    feeRateBps: '0',
    side: isBuy ? 0 : 1,
    signatureType: cfg.signatureType ?? POLY_1271_SIGNATURE_TYPE,
    builder: ZERO_BUILDER_CODE,
  };
  return { domain, types: ORDER_TYPES, primaryType: 'Order' as const, message };
}

/** Deterministic order hash — the idempotency key a restart can re-derive. */
export function computeClobV2OrderHash(
  intent: ClobV2OrderIntent,
  cfg: ClobV2ExchangeConfig,
): string {
  const typed = buildClobV2TypedData(intent, cfg);
  return ethers.TypedDataEncoder.hash(typed.domain, ORDER_TYPES, typed.message);
}

export async function signClobV2Order(
  signer: ethers.Signer,
  intent: ClobV2OrderIntent,
  cfg: ClobV2ExchangeConfig,
): Promise<ClobV2SignedOrder> {
  const typed = buildClobV2TypedData(intent, cfg);
  const signature = await signer.signTypedData(typed.domain, ORDER_TYPES, typed.message);
  return {
    order: intent,
    signature,
    maker: await signer.getAddress(),
    orderHash: ethers.TypedDataEncoder.hash(typed.domain, ORDER_TYPES, typed.message),
  };
}
