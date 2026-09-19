/**
 * Sentry error tracking initialization (stub)
 */
import * as Sentry from '@sentry/node';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || process.env.GIT_SHA || 'unknown',
      tracesSampleRate: 0.1,
    });
  } catch {
    // Sentry initialization failed — no-op
  }
}
