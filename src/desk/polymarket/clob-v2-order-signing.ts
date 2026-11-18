/**
 * Polymarket CLOB V2 — EIP-712 order signing and SDK parity (#272).
 *
 * Aligns `CLOB_V2_ORDER_FIELD_TYPES` byte-for-byte with `CTF_EXCHANGE_V2_ORDER_STRUCT`
 * in `@polymarket/clob-client-v2` (11 signed fields). Transport-only fields live in
 * `clob-v2-order-transport.ts`; offline verification lives in `clob-v2-order-verifier.ts`.
 */

import { ethers } from 'ethers';
import {
  CLOB_V2_EXCHANGE_POLYGON_ADDRESS,
  CLOB_V2_NEG_RISK_EXCHANGE_POLYGON_ADDRESS,
  EXCHANGE_V2_DOMAIN_VERSION,
  EXCHANGE_V3_DOMAIN_NAME,
  EXCHANGE_V3_DOMAIN_VERSION,
  POLYGON_CHAIN_ID,
  POLY_1271_SIGNATURE_TYPE,
  V1_CTF_EXCHANGE_ADDRESS,
  ZERO_BUILDER_CODE,
  ZERO_METADATA_BYTES32,
  type ClobV2ExchangeConfig,
  type ClobV2OrderIntent,
} from './clob-v2-venue-constants';

export const CLOB_V2_ORDER_FIELD_TYPES: ethers.TypedDataField[] = [
  { name: 'salt', type: 'uint256' },
  { name: 'maker', type: 'address' },
  { name: 'signer', type: 'address' },
  { name: 'tokenId', type: 'uint256' },
  { name: 'makerAmount', type: 'uint256' },
  { name: 'takerAmount', type: 'uint256' },
  { name: 'side', type: 'uint8' },
  { name: 'signatureType', type: 'uint8' },
  { name: 'timestamp', type: 'uint256' },
  { name: 'metadata', type: 'bytes32' },
  { name: 'builder', type: 'bytes32' },
];

const ORDER_TYPES: Record<string, ethers.TypedDataField[]> = {
  Order: CLOB_V2_ORDER_FIELD_TYPES,
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface ClobV2SignedOrderMessage {
  salt: string;
  maker: string;
  signer: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  side: 0 | 1;
  signatureType: number;
  timestamp: string;
  metadata: string;
  builder: string;
}

export interface ClobV2SignedOrder {
  order: ClobV2OrderIntent;
  signedMessage: ClobV2SignedOrderMessage;
  signature: string;
  maker: string;
  signer: string;
  orderHash: string;
}

function deriveDeterministicSalt(intent: ClobV2OrderIntent): string {
  if (intent.salt !== undefined) return intent.salt;
  const seed = `${intent.tokenId}:${intent.side}:${intent.price}:${intent.size}:${intent.nonce ?? '0'}`;
  const digest = ethers.id(seed);
  return BigInt(digest.slice(0, 14)).toString(10);
}

const ROUNDING_BY_TICK: Record<string, { price: number; size: number; amount: number }> = {
  '0.1': { price: 1, size: 2, amount: 3 },
  '0.01': { price: 2, size: 2, amount: 4 },
  '0.001': { price: 3, size: 2, amount: 5 },
  '0.0001': { price: 4, size: 2, amount: 6 },
};

function decimalPlaces(num: number): number {
  if (Number.isInteger(num)) return 0;
  const parts = num.toString().split('.');
  return parts[1]?.length ?? 0;
}

function roundDown(num: number, decimals: number): number {
  if (decimalPlaces(num) <= decimals) return num;
  const factor = 10 ** decimals;
  return Math.floor((num + Number.EPSILON) * factor) / factor;
}

function roundNormal(num: number, decimals: number): number {
  if (decimalPlaces(num) <= decimals) return num;
  const factor = 10 ** decimals;
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

function resolveDefaultDomainVersion(verifyingContract: string): '2' | '3' {
  const lower = verifyingContract.toLowerCase();
  if (
    lower === CLOB_V2_EXCHANGE_POLYGON_ADDRESS.toLowerCase() ||
    lower === CLOB_V2_NEG_RISK_EXCHANGE_POLYGON_ADDRESS.toLowerCase()
  ) {
    return EXCHANGE_V2_DOMAIN_VERSION;
  }
  return EXCHANGE_V3_DOMAIN_VERSION;
}

/** Build the EIP-712 payload matching `@polymarket/clob-client-v2` `OrderBuilder`. */
export function buildClobV2TypedData(intent: ClobV2OrderIntent, cfg: ClobV2ExchangeConfig) {
  const verifyingContract = ethers.getAddress(cfg.verifyingContract);
  if (verifyingContract.toLowerCase() === V1_CTF_EXCHANGE_ADDRESS.toLowerCase()) {
    throw new Error(
      'ExchangeV3/V2 verifying contract required; the V1 exchange was retired 2026-04-28',
    );
  }
  const maker = cfg.maker ? ethers.getAddress(cfg.maker) : ZERO_ADDRESS;
  const signer = cfg.signer ? ethers.getAddress(cfg.signer) : maker;
  const domain = {
    name: EXCHANGE_V3_DOMAIN_NAME,
    version: cfg.domainVersion ?? resolveDefaultDomainVersion(verifyingContract),
    chainId: cfg.chainId ?? POLYGON_CHAIN_ID,
    verifyingContract,
  };
  const tickKey = Number(intent.tickSize).toString();
  const roundCfg = ROUNDING_BY_TICK[tickKey] ?? ROUNDING_BY_TICK['0.01']!;
  const rawPrice = roundNormal(intent.price, roundCfg.price);
  const rawSize = roundDown(intent.size, roundCfg.size);
  const rawCollateral = roundNormal(rawSize * rawPrice, roundCfg.amount);
  const sharesRaw = ethers.parseUnits(rawSize.toFixed(roundCfg.size), 6).toString();
  const collateralRaw = ethers.parseUnits(rawCollateral.toFixed(roundCfg.amount), 6).toString();
  const isBuy = intent.side === 'BUY';
  const message: ClobV2SignedOrderMessage = {
    salt: deriveDeterministicSalt(intent),
    maker,
    signer,
    tokenId: intent.tokenId,
    makerAmount: isBuy ? collateralRaw : sharesRaw,
    takerAmount: isBuy ? sharesRaw : collateralRaw,
    side: isBuy ? 0 : 1,
    signatureType: cfg.signatureType ?? POLY_1271_SIGNATURE_TYPE,
    timestamp: intent.timestamp ?? '0',
    metadata: intent.metadata ?? ZERO_METADATA_BYTES32,
    builder: intent.builderCode ?? ZERO_BUILDER_CODE,
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
  const signerAddress = await signer.getAddress();
  const resolvedCfg: ClobV2ExchangeConfig = {
    ...cfg,
    maker: cfg.maker ?? signerAddress,
    signer: cfg.signer ?? signerAddress,
  };
  const typed = buildClobV2TypedData(intent, resolvedCfg);
  const signature = await signer.signTypedData(typed.domain, ORDER_TYPES, typed.message);
  return {
    order: intent,
    signedMessage: typed.message,
    signature,
    maker: typed.message.maker,
    signer: typed.message.signer,
    orderHash: ethers.TypedDataEncoder.hash(typed.domain, ORDER_TYPES, typed.message),
  };
}
