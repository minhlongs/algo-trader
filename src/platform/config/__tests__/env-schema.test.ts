import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateEnv,
  assertLiveCredentials,
  getPaperMode,
  resolveCredential,
} from '../env-schema';

describe('platform/config/env-schema', () => {
  const origEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('defaults to paper mode when PAPER_MODE is unset', () => {
    delete process.env['PAPER_MODE'];
    expect(getPaperMode()).toBe(true);
    const config = validateEnv();
    expect(config.paperMode).toBe(true);
  });

  it('parses PAPER_MODE=false correctly', () => {
    process.env['PAPER_MODE'] = 'false';
    expect(getPaperMode()).toBe(false);
  });

  it('resolves credentials checking primary then legacy', () => {
    process.env['NEW_KEY'] = 'val_new';
    expect(resolveCredential('NEW_KEY', 'OLD_KEY')).toBe('val_new');

    delete process.env['NEW_KEY'];
    process.env['OLD_KEY'] = 'val_old';
    expect(resolveCredential('NEW_KEY', 'OLD_KEY')).toBe('val_old');

    delete process.env['OLD_KEY'];
    expect(resolveCredential('NEW_KEY', 'OLD_KEY')).toBeUndefined();
  });

  it('asserts live credentials properly', () => {
    expect(() => assertLiveCredentials(true)).not.toThrow();

    expect(() => assertLiveCredentials(false)).toThrow(/LIVE trading requires all Polymarket credentials/);

    process.env['POLYMARKET_API_KEY'] = 'key';
    process.env['POLYMARKET_API_SECRET'] = 'secret';
    process.env['POLYMARKET_PASSPHRASE'] = 'pass';
    expect(() => assertLiveCredentials(false)).not.toThrow();
  });
});
