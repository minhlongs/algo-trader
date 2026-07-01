/**
 * Shared config contract — verify config module exports BEFORE migration to shared/.
 *
 * Tests the `config` object from `src/config/env.ts` for:
 *   1. Existence and non-null structure
 *   2. All required keys present
 *   3. Default fallback values when env vars are unset
 *   4. Reads from process.env when set
 *   5. Numeric configs return strings (e.g. '90' not 90)
 *   6. Correct import (no circular dependency)
 *
 * The config object is eagerly evaluated at module load time (reads process.env
 * immediately). Tests reset the module cache and clear/set env vars per case to
 * guarantee deterministic results regardless of ambient environment.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Contract constants — keep in sync with src/config/env.ts
// ---------------------------------------------------------------------------

const ALL_CONFIG_KEYS = [
  'AUDIT_LOG_ENABLED',
  'AUDIT_RETENTION_DAYS',
  'AUDIT_BATCH_SIZE',
  'LICENSE_KEY_PREFIX',
  'LICENSE_ACTIVATION_SECRET',
  'LICENSE_ENCRYPTION_KEY',
  'USAGE_METERING_ENABLED',
  'OVERAGE_ENABLED',
  'OVERAGE_PRICE_PER_CALL',
  'DUNNING_ENABLED',
  'DUNNING_GRACE_PERIOD_DAYS',
  'NOWPAYMENTS_API_KEY',
  'NOWPAYMENTS_IPN_SECRET',
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',
  'SENDGRID_FROM_NAME',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'TELEGRAM_BOT_TOKEN',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
] as const;

/** Keys whose values must be string-encoded numbers, not JS number primitives. */
const NUMERIC_STRING_KEYS: ReadonlySet<string> = new Set([
  'AUDIT_RETENTION_DAYS',
  'AUDIT_BATCH_SIZE',
  'DUNNING_GRACE_PERIOD_DAYS',
  'REDIS_PORT',
]);

/** Expected defaults from the `||` fallback in env.ts. */
const EXPECTED_DEFAULTS: Record<string, string> = {
  AUDIT_LOG_ENABLED: 'true',
  AUDIT_RETENTION_DAYS: '90',
  AUDIT_BATCH_SIZE: '100',
  LICENSE_KEY_PREFIX: 'raas',
  LICENSE_ACTIVATION_SECRET: '',
  LICENSE_ENCRYPTION_KEY: '',
  USAGE_METERING_ENABLED: 'true',
  OVERAGE_ENABLED: 'true',
  OVERAGE_PRICE_PER_CALL: '0.01',
  DUNNING_ENABLED: 'true',
  DUNNING_GRACE_PERIOD_DAYS: '7',
  NOWPAYMENTS_API_KEY: '',
  NOWPAYMENTS_IPN_SECRET: '',
  SENDGRID_API_KEY: '',
  SENDGRID_FROM_EMAIL: '',
  SENDGRID_FROM_NAME: 'Algo Trader',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  TWILIO_PHONE_NUMBER: '',
  TELEGRAM_BOT_TOKEN: '',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Snapshot of env before each test, so afterEach can restore. */
let savedEnv: Record<string, string | undefined>;

/**
 * Clear all known config env vars from process.env so the next `import()` sees
 * a clean (default-only) state.
 */
function clearAllConfigEnvVars(): void {
  for (const key of ALL_CONFIG_KEYS) {
    delete process.env[key];
  }
}

beforeEach(() => {
  // Snapshot current values so we can restore after.
  savedEnv = {};
  for (const key of ALL_CONFIG_KEYS) {
    savedEnv[key] = process.env[key];
  }
  clearAllConfigEnvVars();
  // Reset the module cache so the next dynamic import constructs a fresh config.
  vi.resetModules();
});

afterEach(() => {
  // Restore original env values.
  for (const key of ALL_CONFIG_KEYS) {
    const original = savedEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shared config contract', () => {
  // 1. Config object is defined and non-null.
  it('config object is defined and non-null', async () => {
    const { config } = await import('../../src/shared/config/env');
    expect(config).toBeDefined();
    expect(config).not.toBeNull();
    expect(typeof config).toBe('object');
  });

  // 2. All required keys exist on the config object.
  it('all required keys exist on config object', async () => {
    const { config } = await import('../../src/shared/config/env');

    for (const key of ALL_CONFIG_KEYS) {
      expect(
        Object.prototype.hasOwnProperty.call(config, key),
        `config.${key} is missing`,
      ).toBe(true);
      expect(config[key as keyof typeof config], `config.${key} is undefined`).toBeDefined();
    }
  });

  // 3. Config values fall back to defaults when env vars are unset.
  it('config values fall back to defaults when env vars are unset', async () => {
    // All known env vars were cleared in beforeEach — import should see pure defaults.
    const { config } = await import('../../src/shared/config/env');

    for (const key of ALL_CONFIG_KEYS) {
      const expected = EXPECTED_DEFAULTS[key];
      const actual = config[key as keyof typeof config];
      expect(
        actual,
        `config.${key} expected default "${expected}", got "${actual}"`,
      ).toBe(expected);
    }
  });

  // 4. Config reads from process.env when set.
  it('config reads from process.env when set', async () => {
    process.env.AUDIT_RETENTION_DAYS = '42';
    process.env.SENDGRID_FROM_NAME = 'TestBot';
    process.env.REDIS_HOST = 'redis.example.com';
    process.env.DUNNING_GRACE_PERIOD_DAYS = '14';

    const { config } = await import('../../src/shared/config/env');

    expect(config.AUDIT_RETENTION_DAYS).toBe('42');
    expect(config.SENDGRID_FROM_NAME).toBe('TestBot');
    expect(config.REDIS_HOST).toBe('redis.example.com');
    expect(config.DUNNING_GRACE_PERIOD_DAYS).toBe('14');

    // Keys NOT overridden should still fall back to defaults.
    expect(config.AUDIT_LOG_ENABLED).toBe('true');
    expect(config.LICENSE_KEY_PREFIX).toBe('raas');
  });

  // 5. Numeric config values are strings, not JS number primitives.
  it('config returns string values for numeric configs', async () => {
    const { config } = await import('../../src/shared/config/env');

    for (const key of NUMERIC_STRING_KEYS) {
      const value = config[key as keyof typeof config];
      expect(
        typeof value,
        `config.${key} should be string, got ${typeof value} (${value})`,
      ).toBe('string');
      // Also verify the string can be parsed as a valid number (sanity).
      const parsed = Number(value);
      expect(
        Number.isNaN(parsed),
        `config.${key}="${value}" is not a valid numeric string`,
      ).toBe(false);
    }
  });

  // 6. Import is correct — no circular dependencies, module loads cleanly.
  it('config is imported correctly with no circular dependencies', async () => {
    // Dynamic import should resolve and load without throwing.
    const mod = await import('../../src/shared/config/env');
    expect(mod).toBeDefined();
    expect(mod.config).toBeDefined();
    expect(typeof mod.validateEnvVars).toBe('function');
    expect(typeof mod.logConfigStatus).toBe('function');
  });

  // -----------------------------------------------------------------------
  // Bonus: secondary exports (validateEnvVars, logConfigStatus) exist.
  // -----------------------------------------------------------------------

  it('validateEnvVars is exported and is callable', async () => {
    const { validateEnvVars } = await import('../../src/shared/config/env');
    expect(typeof validateEnvVars).toBe('function');
    // Should not throw when no required notification vars are set
    // (we cleared them in beforeEach — but these are "required" vars,
    // so validateEnvVars WILL throw). Verify it throws the expected error.
    expect(() => validateEnvVars()).toThrow(/Missing required env vars/);
  });

  it('logConfigStatus is exported and is callable', async () => {
    const { logConfigStatus } = await import('../../src/shared/config/env');
    expect(typeof logConfigStatus).toBe('function');
    // logConfigStatus logs and returns void — should not throw.
    expect(() => logConfigStatus()).not.toThrow();
  });
});
