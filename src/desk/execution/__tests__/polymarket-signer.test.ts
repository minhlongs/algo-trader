/**
 * Tests for polymarket-signer — PolymarketSigner EIP-712 order signing.
 *
 * ethers is mocked (Wallet.address / signTypedData; TypedDataEncoder.hash)
 * so no crypto or network is involved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { walletAddress, signTypedData, hashResult } = vi.hoisted(() => ({
  walletAddress: '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01',
  signTypedData: vi.fn(),
  hashResult: '0xdeadbeefcafebabe',
}));

vi.mock('ethers', () => ({
  ethers: {
    Wallet: vi.fn(),
    TypedDataEncoder: {
      hash: vi.fn(() => hashResult),
    },
  },
}));

import { ethers } from 'ethers';
import { PolymarketSigner, type PolymarketOrder } from '../polymarket-signer';

class FakeWallet {
  address = walletAddress;
  signTypedData = signTypedData;
}

beforeEach(() => {
  vi.clearAllMocks();
  (ethers.Wallet as unknown as ReturnType<typeof vi.fn>).mockImplementation(FakeWallet);
});

const VALID_KEY = 'a'.repeat(64);
const VALID_KEY_0X = '0x' + 'a'.repeat(64);

const sampleOrder = (over: Partial<PolymarketOrder> = {}): PolymarketOrder => ({
  tokenId: '12345', price: 0.5, size: 10, side: 'BUY',
  expiration: 1750000000, nonce: 'nonce-1', feeRateBps: 0, signatureType: 0,
  ...over,
});

describe('PolymarketSigner.isPaperKey', () => {
  it('treats empty/falsy input as a paper key', () => {
    expect(PolymarketSigner.isPaperKey('')).toBe(true);
    expect(PolymarketSigner.isPaperKey(undefined as unknown as string)).toBe(true);
  });

  it('rejects keys that are not 64 hex chars', () => {
    expect(PolymarketSigner.isPaperKey('not-a-key')).toBe(true);
    expect(PolymarketSigner.isPaperKey('abc')).toBe(true);
    expect(PolymarketSigner.isPaperKey('g'.repeat(64))).toBe(true); // non-hex
    expect(PolymarketSigner.isPaperKey('a'.repeat(63))).toBe(true);
    expect(PolymarketSigner.isPaperKey('a'.repeat(65))).toBe(true);
  });

  it('rejects all-zero keys', () => {
    expect(PolymarketSigner.isPaperKey('00'.repeat(64))).toBe(true);
    expect(PolymarketSigner.isPaperKey('0x' + '00'.repeat(64))).toBe(true);
  });

  it('accepts a valid 64-hex key (with and without 0x prefix)', () => {
    expect(PolymarketSigner.isPaperKey(VALID_KEY)).toBe(false);
    expect(PolymarketSigner.isPaperKey(VALID_KEY_0X)).toBe(false);
  });
});

describe('PolymarketSigner constructor', () => {
  it('throws when the private key is missing', () => {
    expect(() => new PolymarketSigner('')).toThrow('privateKey is required');
  });

  it('throws when the key looks like a placeholder', () => {
    expect(() => new PolymarketSigner('a'.repeat(63))).toThrow(/Invalid private key: looks like a placeholder/);
  });

  it('normalises a 0x-prefixed key into the ethers Wallet', () => {
    const signer = new PolymarketSigner(VALID_KEY_0X);
    expect(ethers.Wallet).toHaveBeenCalledWith('0x' + 'a'.repeat(64));
    expect(signer.getAddress()).toBe(walletAddress);
  });

  it('normalises a non-prefixed key into the ethers Wallet', () => {
    const signer = new PolymarketSigner(VALID_KEY);
    expect(ethers.Wallet).toHaveBeenCalledWith('0x' + 'a'.repeat(64));
    expect(signer.getAddress()).toBe(walletAddress);
  });

  it('honours an explicit chainId override', () => {
    const signer = new PolymarketSigner(VALID_KEY, 80000);
    expect(signer.buildTypedData(sampleOrder()).domain.chainId).toBe(80000);
  });
});

describe('PolymarketSigner.buildTypedData', () => {
  let signer: PolymarketSigner;
  beforeEach(() => {
    signer = new PolymarketSigner(VALID_KEY);
  });

  it('builds the EIP-712 domain, types and message for a BUY order', () => {
    const typed = signer.buildTypedData(sampleOrder());
    expect(typed.domain).toEqual({
      name: 'Polymarket CTF Exchange',
      version: '1',
      chainId: 137,
      verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
    });
    expect(typed.primaryType).toBe('Order');
    expect(typed.types.Order.map((f) => f.name)).toEqual([
      'tokenId', 'makerAmount', 'takerAmount', 'expiration', 'nonce',
      'feeRateBps', 'side', 'signatureType',
    ]);
    expect(typed.message).toEqual({
      tokenId: '12345',
      makerAmount: '10000000',
      takerAmount: '5000000',
      expiration: '1750000000',
      nonce: 'nonce-1',
      feeRateBps: '0',
      side: 0,
      signatureType: 0,
    });
  });

  it('maps a SELL order to side=1', () => {
    const typed = signer.buildTypedData(sampleOrder({ side: 'SELL' }));
    expect((typed.message as Record<string, unknown>).side).toBe(1);
  });
});

describe('PolymarketSigner.createOrderHash', () => {
  it('delegates to ethers.TypedDataEncoder.hash and returns the hash', async () => {
    const signer = new PolymarketSigner(VALID_KEY);
    expect(await Promise.resolve(signer.createOrderHash(sampleOrder()))).toBe(hashResult);
    expect(ethers.TypedDataEncoder.hash).toHaveBeenCalledTimes(1);
  });
});

describe('PolymarketSigner.signOrder', () => {
  it('signs the typed data and returns a signed order with the maker address', async () => {
    const signer = new PolymarketSigner(VALID_KEY);
    signTypedData.mockResolvedValue('0xsig');
    const order = sampleOrder();
    const signed = await signer.signOrder(order);
    expect(signTypedData).toHaveBeenCalledTimes(1);
    expect(signed).toEqual({
      ...order,
      signature: '0xsig',
      maker: walletAddress,
    });
  });
});

describe('PolymarketSigner.generateNonce', () => {
  it('returns a decimal string derived from Math.random', () => {
    const signer = new PolymarketSigner(VALID_KEY);
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
    expect(signer.generateNonce()).toBe(Math.floor(0.42 * Number.MAX_SAFE_INTEGER).toString());
    expect(spy).toHaveBeenCalledTimes(1);
  });
});