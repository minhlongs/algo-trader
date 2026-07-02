/**
 * Tests for Polymarket Execution Adapter Builder
 * Phase 39 Polymarket Live Execution
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger before import to avoid side effects
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock PolymarketSigner to avoid real key validation
vi.mock('../polymarket-signer', () => {
  const mockGetAddress = vi.fn().mockReturnValue('0xTest1234567890abcdef');
  const mockSigner = vi.fn().mockImplementation(function (this: Record<string, unknown>, _key: string) {
    this.getAddress = mockGetAddress;
  });
  return { PolymarketSigner: mockSigner };
});

// Mock PolymarketAdapter
vi.mock('../polymarket-adapter', () => ({
  PolymarketAdapter: vi.fn().mockImplementation(function (this: Record<string, unknown>, signer: unknown) {
    this.signer = signer;
  }),
}));

import { buildPolymarketAdapter } from '../polymarket-execution-adapter';

const FAKE_ENV = {
  POLYMARKET_API_KEY: 'test-api-key',
  POLYMARKET_API_SECRET: 'test-api-secret',
  POLYMARKET_PASSPHRASE: 'test-passphrase',
  POLYMARKET_PRIVATE_KEY: 'a'.repeat(64),
};

describe('buildPolymarketAdapter', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(FAKE_ENV)) {
      process.env[k] = v;
    }
  });

  afterEach(() => {
    for (const k of Object.keys(FAKE_ENV)) {
      delete process.env[k];
    }
    // Cleanup deprecated names too
    for (const k of ['POLY_API_KEY', 'POLY_API_SECRET', 'POLY_PASSPHRASE', 'POLY_PRIVATE_KEY']) {
      delete process.env[k];
    }
  });

  it('returns paper stub when paperTrading is true (default)', () => {
    const result = buildPolymarketAdapter({ paperTrading: true });
    expect(result.adapter).toBeNull();
    expect(result.signer).toBeNull();
    expect(result.paperTrading).toBe(true);
  });

  it('returns paper stub when paperTrading is omitted (defaults to true)', () => {
    const result = buildPolymarketAdapter({ paperTrading: undefined as unknown as boolean });
    expect(result.adapter).toBeNull();
    expect(result.signer).toBeNull();
    expect(result.paperTrading).toBe(true);
  });

  it('creates live adapter + signer when paperTrading is false and env vars are set', () => {
    const result = buildPolymarketAdapter({ paperTrading: false });
    expect(result.adapter).not.toBeNull();
    expect(result.signer).not.toBeNull();
    expect(result.paperTrading).toBe(false);
  });

  it('throws when paperTrading is false and POLYMARKET_PRIVATE_KEY is missing', () => {
    delete process.env.POLYMARKET_PRIVATE_KEY;
    expect(() => buildPolymarketAdapter({ paperTrading: false })).toThrow(
      /POLYMARKET_PRIVATE_KEY/,
    );
  });

  it('throws when paperTrading is false and POLYMARKET_API_KEY is missing', () => {
    delete process.env.POLYMARKET_API_KEY;
    expect(() => buildPolymarketAdapter({ paperTrading: false })).toThrow(
      /POLYMARKET_API_KEY/,
    );
  });

  it('throws when paperTrading is false and multiple env vars are missing', () => {
    delete process.env.POLYMARKET_API_KEY;
    delete process.env.POLYMARKET_API_SECRET;
    expect(() => buildPolymarketAdapter({ paperTrading: false })).toThrow(
      /POLYMARKET_API_KEY.*POLYMARKET_API_SECRET/,
    );
  });

  it('does not check env vars in PAPER mode', () => {
    for (const k of Object.keys(FAKE_ENV)) {
      delete process.env[k];
    }
    const result = buildPolymarketAdapter({ paperTrading: true });
    expect(result.adapter).toBeNull();
    expect(result.paperTrading).toBe(true);
  });

  it('configures custom chain ID when provided', async () => {
    const mod = await import('../polymarket-signer');
    const prevCalls = (mod.PolymarketSigner as ReturnType<typeof vi.fn>).mock.calls.length;
    buildPolymarketAdapter({ paperTrading: false, chainId: 80001 });
    // Should have been called with the chainId
    expect((mod.PolymarketSigner as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    // New call count > previous
    expect((mod.PolymarketSigner as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(prevCalls);
  });

  it('accepts deprecated POLY_* env vars as fallback', () => {
    // Remove new-style vars, set old-style
    for (const k of Object.keys(FAKE_ENV)) {
      delete process.env[k];
    }
    process.env.POLY_API_KEY = 'old-key';
    process.env.POLY_API_SECRET = 'old-secret';
    process.env.POLY_PASSPHRASE = 'old-passphrase';
    process.env.POLY_PRIVATE_KEY = 'b'.repeat(64);

    const result = buildPolymarketAdapter({ paperTrading: false });
    expect(result.adapter).not.toBeNull();
    expect(result.signer).not.toBeNull();
    expect(result.paperTrading).toBe(false);

    // Cleanup
    delete process.env.POLY_API_KEY;
    delete process.env.POLY_API_SECRET;
    delete process.env.POLY_PASSPHRASE;
    delete process.env.POLY_PRIVATE_KEY;
  });

  it('reads POLY_CLOB_HOST env var for API URL', async () => {
    process.env.POLY_CLOB_HOST = 'https://clob.staging.polymarket.com';
    const mod = await import('../polymarket-adapter');
    const prevCalls = (mod.PolymarketAdapter as ReturnType<typeof vi.fn>).mock.calls.length;

    buildPolymarketAdapter({ paperTrading: false });

    const calls = (mod.PolymarketAdapter as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[1]).toBe('https://clob.staging.polymarket.com');

    delete process.env.POLY_CLOB_HOST;
  });

  it('reads POLY_CHAIN_ID env var for chain ID', async () => {
    process.env.POLY_CHAIN_ID = '80001';
    const mod = await import('../polymarket-signer');

    buildPolymarketAdapter({ paperTrading: false });

    const calls = (mod.PolymarketSigner as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1];
    // chainId is second argument to PolymarketSigner constructor
    expect(lastCall[1]).toBe(80001);

    delete process.env.POLY_CHAIN_ID;
  });
});
