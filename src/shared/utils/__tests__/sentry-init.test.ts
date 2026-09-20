/**
 * Sentry initialization and manual capture unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/node';
import { initSentry, captureError } from '../sentry-init';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

describe('sentry-init', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_RELEASE;
    delete process.env.GIT_SHA;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('initSentry', () => {
    it('returns early when SENTRY_DSN is not configured', () => {
      delete process.env.SENTRY_DSN;
      initSentry();
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('initializes Sentry with standard environment and release variables', () => {
      process.env.SENTRY_DSN = 'https://exampleKey@o0.ingest.sentry.io/0';
      process.env.NODE_ENV = 'production';
      process.env.SENTRY_RELEASE = 'v1.2.3';

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith({
        dsn: 'https://exampleKey@o0.ingest.sentry.io/0',
        environment: 'production',
        release: 'v1.2.3',
        tracesSampleRate: 0.1,
      });
    });

    it('falls back to development environment when NODE_ENV is unset', () => {
      process.env.SENTRY_DSN = 'https://exampleKey@o0.ingest.sentry.io/0';
      delete process.env.NODE_ENV;
      process.env.SENTRY_RELEASE = 'v1.0.0';

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith({
        dsn: 'https://exampleKey@o0.ingest.sentry.io/0',
        environment: 'development',
        release: 'v1.0.0',
        tracesSampleRate: 0.1,
      });
    });

    it('falls back to GIT_SHA when SENTRY_RELEASE is unset', () => {
      process.env.SENTRY_DSN = 'https://exampleKey@o0.ingest.sentry.io/0';
      process.env.NODE_ENV = 'staging';
      delete process.env.SENTRY_RELEASE;
      process.env.GIT_SHA = 'commit-sha-abcdef';

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith({
        dsn: 'https://exampleKey@o0.ingest.sentry.io/0',
        environment: 'staging',
        release: 'commit-sha-abcdef',
        tracesSampleRate: 0.1,
      });
    });

    it('falls back to "unknown" release when both SENTRY_RELEASE and GIT_SHA are unset', () => {
      process.env.SENTRY_DSN = 'https://exampleKey@o0.ingest.sentry.io/0';
      process.env.NODE_ENV = 'test';
      delete process.env.SENTRY_RELEASE;
      delete process.env.GIT_SHA;

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith({
        dsn: 'https://exampleKey@o0.ingest.sentry.io/0',
        environment: 'test',
        release: 'unknown',
        tracesSampleRate: 0.1,
      });
    });
  });

  describe('captureError', () => {
    it('calls Sentry.captureException with error and context', () => {
      const err = new Error('database connection timeout');
      const ctx = { requestId: 'req-123', retries: 3 };

      captureError(err, ctx);

      expect(Sentry.captureException).toHaveBeenCalledWith(err, { extra: ctx });
    });

    it('calls Sentry.captureException when context is undefined', () => {
      const err = new Error('unexpected error');

      captureError(err);

      expect(Sentry.captureException).toHaveBeenCalledWith(err, { extra: undefined });
    });
  });
});
