/**
 * LIVE mode fails closed.
 *
 * An operator who asks for live money must never silently receive paper
 * execution instead: a paper run that looks like a live run is the exact
 * failure that costs real positions. These tests hold the throw contract.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../polymarket-signer', () => {
  const mockGetAddress = vi.fn().mockReturnValue('0xTest1234567890abcdef');
  return {
    PolymarketSigner: vi.fn().mockImplementation(function (this: Record<string, unknown>, _key: string) {
      this.getAddress = mockGetAddress;
    }),
  };
});

vi.mock('../polymarket-adapter', () => ({
  PolymarketAdapter: vi.fn().mockImplementation(function (this: Record<string, unknown>, signer: unknown) {
    this.signer = signer;
  }),
}));

import { buildPolymarketAdapter } from '../polymarket-execution-adapter';
import { resetExecutionModeCache } from '../execution-mode';

/** The four credentials the error message must name for a live run. */
const CREDENTIAL_NAMES = [
  'POLYMARKET_API_KEY',
  'POLYMARKET_API_SECRET',
  'POLYMARKET_PASSPHRASE',
  'POLYMARKET_PRIVATE_KEY',
] as const;

const ALL_CREDENTIAL_KEYS = [
  'POLYMARKET_TRADING_MODE',
  ...CREDENTIAL_NAMES,
  'POLY_API_KEY',
  'POLY_API_SECRET',
  'POLY_PASSPHRASE',
  'POLY_PRIVATE_KEY',
] as const;

const CREDENTIALS: Record<string, string> = {
  POLYMARKET_API_KEY: 'test-api-key',
  POLYMARKET_API_SECRET: 'test-api-secret',
  POLYMARKET_PASSPHRASE: 'test-passphrase',
  POLYMARKET_PRIVATE_KEY: 'a'.repeat(64),
};

/**
 * The live-arming flag. The unified execution-mode gate reads it before the
 * credential check, so a LIVE request only reaches the credentials this suite
 * is about when the operator has actually armed live trading. Without it the
 * mode resolves to READ_ONLY and the adapter returns a paper stub early, which
 * is a different contract from the fail-closed one asserted here.
 */
const ARM_LIVE = 'LIVE_TRADING_ENABLED';

function clearCredentials(): void {
  for (const key of ALL_CREDENTIAL_KEYS) delete process.env[key];
}

function armLiveTrading(): void {
  process.env[ARM_LIVE] = 'true';
}

function messageFrom(build: () => unknown): string {
  try {
    build();
    return '';
  } catch (err) {
    return (err as Error).message;
  }
}

describe('buildPolymarketAdapter LIVE fail-closed', () => {
  beforeEach(() => {
    clearCredentials();
    armLiveTrading();
    Object.assign(process.env, CREDENTIALS);
    resetExecutionModeCache();
  });

  afterEach(() => {
    clearCredentials();
    delete process.env[ARM_LIVE];
    resetExecutionModeCache();
  });

  it('throws when paperTrading is false and one credential is missing', () => {
    delete process.env.POLYMARKET_PRIVATE_KEY;
    const message = messageFrom(() => buildPolymarketAdapter({ paperTrading: false }));
    expect(message).toContain('POLYMARKET_PRIVATE_KEY');
  });

  it('throws when paperTrading is false and every credential is missing', () => {
    clearCredentials();
    const message = messageFrom(() => buildPolymarketAdapter({ paperTrading: false }));
    expect(message).toContain('requires all Polymarket credentials');
  });

  it('names every missing credential in a single message', () => {
    clearCredentials();
    const message = messageFrom(() => buildPolymarketAdapter({ paperTrading: false }));
    for (const key of CREDENTIAL_NAMES) {
      expect(message).toContain(key);
    }
  });

  it('does not list the mode selector as if it were a credential', () => {
    clearCredentials();
    const message = messageFrom(() => buildPolymarketAdapter({ paperTrading: false }));
    expect(message).not.toContain('POLYMARKET_TRADING_MODE');
  });

  it('throws when POLYMARKET_TRADING_MODE=live but credentials are missing', () => {
    process.env.POLYMARKET_TRADING_MODE = 'live';
    delete process.env.POLYMARKET_API_KEY;
    expect(() => buildPolymarketAdapter({})).toThrow(/POLYMARKET_API_KEY/);
  });

  it('does not downgrade to paper in any live path', () => {
    clearCredentials();
    expect(() => buildPolymarketAdapter({ paperTrading: false })).toThrow();
    expect(() => buildPolymarketAdapter({})).not.toThrow();
  });

  it('still builds live when all credentials are present', () => {
    const result = buildPolymarketAdapter({ paperTrading: false });
    expect(result.adapter).not.toBeNull();
    expect(result.signer).not.toBeNull();
    expect(result.paperTrading).toBe(false);
  });

  it('still returns paper when paper is requested, regardless of credentials', () => {
    clearCredentials();
    const result = buildPolymarketAdapter({ paperTrading: true });
    expect(result.adapter).toBeNull();
    expect(result.signer).toBeNull();
    expect(result.paperTrading).toBe(true);
  });
});
