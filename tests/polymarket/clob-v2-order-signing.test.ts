/**
 * Pins the ExchangeV3 EIP-712 payload and the order hash against a fake key.
 *
 * No CLOB credentials exist in this environment, so these tests prove the shape
 * of the signed order and the determinism a restart depends on. They do NOT
 * prove the venue accepts the signature — that needs a live call.
 */

import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import {
  EXCHANGE_V3_DOMAIN_NAME,
  EXCHANGE_V3_DOMAIN_VERSION,
  MIN_RESTING_ORDER_SHARES,
  POLY_1271_SIGNATURE_TYPE,
  POLYGON_CHAIN_ID,
  PUSD_COLLATERAL_ADDRESS,
  V1_CTF_EXCHANGE_ADDRESS,
  ZERO_BUILDER_CODE,
  buildClobV2TypedData,
  computeClobV2OrderHash,
  signClobV2Order,
  type ClobV2OrderIntent,
} from '../../src/desk/polymarket/clob-v2-order-surface';

/** Any non-V1 address stands in for ExchangeV3, whose address the report omits. */
const EXCHANGE_V3 = '0x1111111111111111111111111111111111111111';
/** Deterministic throwaway key — never funded, never leaves the test. */
const FAKE_KEY = `0x${'11'.repeat(32)}`;

const BASE_ORDER: ClobV2OrderIntent = {
  tokenId: '12345678901234567890',
  side: 'BUY',
  price: 0.5,
  size: 10,
  orderType: 'GTC',
  tickSize: 0.01,
};

describe('venue facts', () => {
  it('points the ExchangeV3 domain at version "3" on Polygon', () => {
    expect(EXCHANGE_V3_DOMAIN_VERSION).toBe('3');
    expect(EXCHANGE_V3_DOMAIN_NAME).toBe('Polymarket CTF Exchange');
    expect(POLYGON_CHAIN_ID).toBe(137);
  });

  it('names pUSD as the collateral token', () => {
    expect(PUSD_COLLATERAL_ADDRESS).toBe('0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB');
  });

  // V1 used 0 = EOA, 1 = POLY_PROXY, 2 = POLY_GNOSIS_SAFE. The report names
  // Poly1271 but publishes no numeric value, so 3 is inferred and must be
  // re-checked against the live API before any signed order is sent.
  it('carries Poly1271 as an inferred fourth signature type', () => {
    expect(POLY_1271_SIGNATURE_TYPE).toBe(3);
  });

  it('states the 5-share minimum on resting orders', () => {
    expect(MIN_RESTING_ORDER_SHARES).toBe(5);
  });
});

describe('buildClobV2TypedData', () => {
  it('stamps the ExchangeV3 domain', () => {
    const typed = buildClobV2TypedData(BASE_ORDER, { verifyingContract: EXCHANGE_V3 });
    expect(typed.domain.name).toBe(EXCHANGE_V3_DOMAIN_NAME);
    expect(typed.domain.version).toBe('3');
    expect(typed.domain.chainId).toBe(137);
    expect(typed.domain.verifyingContract).toBe(EXCHANGE_V3);
  });

  it('refuses to sign against the retired V1 exchange', () => {
    expect(() =>
      buildClobV2TypedData(BASE_ORDER, { verifyingContract: V1_CTF_EXCHANGE_ADDRESS }),
    ).toThrow(/retired/);
  });

  it('signs with Poly1271 and a zero builder code', () => {
    const { message } = buildClobV2TypedData(BASE_ORDER, { verifyingContract: EXCHANGE_V3 });
    expect(message.signatureType).toBe(POLY_1271_SIGNATURE_TYPE);
    expect(message.builder).toBe(ZERO_BUILDER_CODE);
    expect(message.builder).toHaveLength(66);
  });

  it('scales BUY collateral/shares and SELL shares/collateral to 6-decimal units and honours signatureType override', () => {
    const buy = buildClobV2TypedData(BASE_ORDER, { verifyingContract: EXCHANGE_V3 });
    expect(buy.message.makerAmount).toBe('5000000');
    expect(buy.message.takerAmount).toBe('10000000');

    const sell = buildClobV2TypedData(
      { ...BASE_ORDER, side: 'SELL' },
      { verifyingContract: EXCHANGE_V3, signatureType: 2 },
    );
    expect(sell.message.makerAmount).toBe('10000000');
    expect(sell.message.takerAmount).toBe('5000000');
    expect(sell.message.signatureType).toBe(2);
  });

  it('encodes the side as 0 for BUY and 1 for SELL', () => {
    const buy = buildClobV2TypedData(BASE_ORDER, { verifyingContract: EXCHANGE_V3 });
    const sell = buildClobV2TypedData(
      { ...BASE_ORDER, side: 'SELL' },
      { verifyingContract: EXCHANGE_V3 },
    );
    expect(buy.message.side).toBe(0);
    expect(sell.message.side).toBe(1);
  });
});

describe('signClobV2Order', () => {
  const wallet = new ethers.Wallet(FAKE_KEY);

  it('produces a recoverable signature over the ExchangeV3 digest', async () => {
    const signed = await signClobV2Order(wallet, BASE_ORDER, { verifyingContract: EXCHANGE_V3 });
    const typed = buildClobV2TypedData(BASE_ORDER, { verifyingContract: EXCHANGE_V3 });
    const recovered = ethers.verifyTypedData(
      typed.domain,
      { Order: typed.types.Order },
      typed.message,
      signed.signature,
    );
    expect(recovered).toBe(wallet.address);
    expect(signed.maker).toBe(wallet.address);
  });

  it('hashes deterministically so a restart can re-derive the idempotency key', async () => {
    const first = await signClobV2Order(wallet, BASE_ORDER, { verifyingContract: EXCHANGE_V3 });
    const second = await signClobV2Order(wallet, BASE_ORDER, { verifyingContract: EXCHANGE_V3 });
    expect(first.orderHash).toBe(second.orderHash);
    expect(first.orderHash).toBe(
      computeClobV2OrderHash(BASE_ORDER, { verifyingContract: EXCHANGE_V3 }),
    );
  });

  it('changes the hash when the price changes', () => {
    const flat = computeClobV2OrderHash(BASE_ORDER, { verifyingContract: EXCHANGE_V3 });
    const moved = computeClobV2OrderHash(
      { ...BASE_ORDER, price: 0.51 },
      { verifyingContract: EXCHANGE_V3 },
    );
    expect(flat).not.toBe(moved);
  });
});
