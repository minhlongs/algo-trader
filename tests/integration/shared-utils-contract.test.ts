/**
 * Shared utility module contract verification.
 *
 * Verifies that utility modules satisfy their API contracts and are
 * independently importable before migration to shared/.
 *
 * Complementary to discipline-sync tests — this file actually imports
 * and exercises the modules at runtime.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Mocks — vitest hoists these above imports.
// vi.hoisted() ensures the factory references are available when the hoisted
// vi.mock factory executes.
// ---------------------------------------------------------------------------

const { mockLogMethods } = vi.hoisted(() => ({
  mockLogMethods: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('winston', () => ({
  default: {
    createLogger: vi.fn(() => mockLogMethods),
    format: {
      json: vi.fn(() => 'json'),
      combine: vi.fn((...args: unknown[]) => args),
      colorize: vi.fn(() => 'colorize'),
      simple: vi.fn(() => 'simple'),
    },
    transports: {
      Console: vi.fn(),
      File: vi.fn(),
    },
  },
}));

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { logger } from '../../src/shared/utils/logger';
import { computeHmacSha256, verifyHmacSha256 } from '../../src/shared/utils/hmac-verifier';
import { initSentry, captureError } from '../../src/shared/utils/sentry-init';
import { getTracer, initTracing, resetTracingForTests } from '../../src/shared/utils/tracing';

const REPO_ROOT = resolve(__dirname, '../..');

function readUtilSource(filename: string): string {
  return readFileSync(resolve(REPO_ROOT, 'src/shared/utils', filename), 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Shared utility module contracts', () => {
  // ==========================================================
  // 1. Logger contract
  // ==========================================================
  describe('logger', () => {
    it('is defined and has expected methods (info, warn, error, debug)', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('methods are callable without throwing', () => {
      expect(() => logger.info('test info')).not.toThrow();
      expect(() => logger.warn('test warn')).not.toThrow();
      expect(() => logger.error('test error')).not.toThrow();
      expect(() => logger.debug('test debug')).not.toThrow();
    });

    it('methods accept message + metadata arguments', () => {
      expect(() => logger.info('msg', { key: 'value' })).not.toThrow();
      expect(() => logger.error('err', { stack: 'trace' })).not.toThrow();
    });

    it('reads LOG_LEVEL env var with "info" default (env-tunable)', () => {
      const src = readUtilSource('logger.ts');
      expect(
        /process\.env\.LOG_LEVEL/.test(src),
        'must read process.env.LOG_LEVEL for ops tunability',
      ).toBe(true);
      expect(
        /['"]info['"]/.test(src),
        'default log level must be "info" (prod-safe)',
      ).toBe(true);
    });

    it('has both named and default export for caller import-style freedom', () => {
      const src = readUtilSource('logger.ts');
      expect(/export\s+\{\s*logger\s*\}/.test(src)).toBe(true);
      expect(/export\s+default\s+logger/.test(src)).toBe(true);
    });
  });

  // ==========================================================
  // 2. HMAC verifier contract
  // ==========================================================
  describe('hmac-verifier', () => {
    it('exports computeHmacSha256 as a function', () => {
      expect(computeHmacSha256).toBeDefined();
      expect(typeof computeHmacSha256).toBe('function');
    });

    it('exports verifyHmacSha256 as a function', () => {
      expect(verifyHmacSha256).toBeDefined();
      expect(typeof verifyHmacSha256).toBe('function');
    });

    it('computeHmacSha256 returns a 64-char lowercase hex digest', () => {
      const result = computeHmacSha256('secret', 'payload');
      expect(typeof result).toBe('string');
      expect(result.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
    });

    it('verifyHmacSha256 returns false for signature missing sha256= prefix', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(verifyHmacSha256('body', 'bare-hex', 'secret', now)).toBe(false);
    });

    it('verifyHmacSha256 returns false for expired timestamp', () => {
      const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 min ago
      expect(verifyHmacSha256('body', 'sha256=abcdef', 'secret', oldTs)).toBe(false);
    });

    it('verifyHmacSha256 round-trip: correct signature + valid timestamp => true', () => {
      const secret = 'test-secret';
      const payload = '{"action":"buy"}';
      const sig = `sha256=${computeHmacSha256(secret, payload)}`;
      const now = Math.floor(Date.now() / 1000);
      expect(verifyHmacSha256(payload, sig, secret, now)).toBe(true);
    });
  });

  // ==========================================================
  // 3. Sentry-init contract
  // ==========================================================
  describe('sentry-init', () => {
    it('exports initSentry as a function', () => {
      expect(initSentry).toBeDefined();
      expect(typeof initSentry).toBe('function');
    });

    it('exports captureError as a function', () => {
      expect(captureError).toBeDefined();
      expect(typeof captureError).toBe('function');
    });

    it('initSentry does not throw when called (safe noop without DSN)', () => {
      // initSentry checks SENTRY_DSN internally and early-returns if unset.
      // With @sentry/node mocked, the init path is safe.
      expect(() => initSentry()).not.toThrow();
    });

    it('captureError delegates to Sentry.captureException with context', async () => {
      const Sentry = await import('@sentry/node');
      const err = new Error('test');
      const ctx = { userId: 'abc' };
      captureError(err, ctx);
      expect(Sentry.captureException).toHaveBeenCalledWith(err, { extra: ctx });
    });
  });

  // ==========================================================
  // 4. Tracing contract
  // ==========================================================
  describe('tracing', () => {
    afterEach(() => {
      resetTracingForTests();
    });

    it('exports getTracer as a function', () => {
      expect(getTracer).toBeDefined();
      expect(typeof getTracer).toBe('function');
    });

    it('exports initTracing as a function', () => {
      expect(initTracing).toBeDefined();
      expect(typeof initTracing).toBe('function');
    });

    it('exports resetTracingForTests as a function', () => {
      expect(resetTracingForTests).toBeDefined();
      expect(typeof resetTracingForTests).toBe('function');
    });

    it('getTracer returns tracer with startActiveSpan and startSpan methods', () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();
      expect(typeof tracer.startActiveSpan).toBe('function');
      expect(typeof tracer.startSpan).toBe('function');
    });

    it('noop startActiveSpan invokes callback and returns its result', async () => {
      const tracer = getTracer();
      const result = await tracer.startActiveSpan('test', async () => 'ok');
      expect(result).toBe('ok');
    });

    it('initTracing is idempotent (returns same promise to concurrent callers)', () => {
      const p1 = initTracing();
      const p2 = initTracing();
      expect(p1).toBe(p2);
    });
  });

  // ==========================================================
  // 5. Independent importability (no circular deps between utils)
  // ==========================================================
  describe('independent importability', () => {
    it('all four utility modules imported cleanly (no load-time throws)', () => {
      expect(logger).toBeDefined();
      expect(computeHmacSha256).toBeDefined();
      expect(verifyHmacSha256).toBeDefined();
      expect(initSentry).toBeDefined();
      expect(captureError).toBeDefined();
      expect(getTracer).toBeDefined();
      expect(initTracing).toBeDefined();
      expect(resetTracingForTests).toBeDefined();
    });

    it('no circular import dependencies between utility modules', () => {
      const tracingSrc = readUtilSource('tracing.ts');
      const loggerSrc = readUtilSource('logger.ts');
      const hmacSrc = readUtilSource('hmac-verifier.ts');
      const sentrySrc = readUtilSource('sentry-init.ts');

      // tracing imports from logger (expected one-way dependency)
      expect(/from\s+['"]\.\/logger['"]/.test(tracingSrc)).toBe(true);

      // logger, hmac-verifier, sentry-init are leaf modules (no sibling imports)
      for (const [name, src] of [
        ['logger', loggerSrc],
        ['hmac-verifier', hmacSrc],
        ['sentry-init', sentrySrc],
      ] as const) {
        expect(
          /from\s+['"]\.\//.test(src),
          `${name}.ts must not import sibling utils (leaf module)`,
        ).toBe(false);
      }

      // tracing must not import from hmac-verifier or sentry-init
      expect(/from\s+['"]\.\/hmac-verifier['"]/.test(tracingSrc)).toBe(false);
      expect(/from\s+['"]\.\/sentry-init['"]/.test(tracingSrc)).toBe(false);
    });

    it('hmac-verifier has zero side-effect imports (only node:crypto built-in)', () => {
      const src = readUtilSource('hmac-verifier.ts');
      expect(src).toContain("from 'crypto'");
      expect(src).not.toMatch(/from\s+['"]@/);
    });

    it('sentry-init has zero cross-util imports (only @sentry/node)', () => {
      const src = readUtilSource('sentry-init.ts');
      expect(src).toContain("from '@sentry/node'");
      expect(/from\s+['"]\.\.?\//.test(src)).toBe(false);
    });
  });
});
