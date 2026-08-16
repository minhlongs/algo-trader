/**
 * Sentry error tracking initialization (stub)
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // Sentry is optional; skip if not installed
    // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || process.env.GIT_SHA || 'unknown',
      tracesSampleRate: 0.1,
    });
  } catch {
    // Sentry not installed — no-op
  }
}
