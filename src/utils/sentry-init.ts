/**
 * Sentry error tracking initialization (stub)
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // Sentry is optional; skip if not installed
    // eslint-disable-next-line global-require
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,
    });
  } catch {
    // Sentry not installed — no-op
  }
}
