/**
 * CLI Diagnostics Formatter
 *
 * Catches ZodError, network timeouts, and daemon connectivity failures,
 * producing actionable user-friendly terminal diagnostics without raw stack traces (Rule H4).
 * Standardizes currency PnL notation (-$X.XX vs $-X.XX) and masks sensitive credentials (EC-3.1).
 */

import { ZodError } from 'zod';
import { logger } from '../../shared/utils/logger';

export interface CliDiagnosticResult {
  title: string;
  messages: string[];
}

/**
 * Sanitize error messages to prevent credential leakage (EC-3.1).
 * Masks hex private keys, Bearer tokens, API keys, and URI credentials.
 */
export function sanitizeErrorMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return '';
  return msg
    // Hex private keys: 0x[a-fA-F0-9]{64} -> 0x1234...cdef
    .replace(/(?<![a-fA-F0-9])0x[a-fA-F0-9]{64}(?![a-fA-F0-9])/g, (m) => `${m.slice(0, 6)}...${m.slice(-4)}`)
    // Bearer / JWT tokens: Bearer followed by token string -> Bearer ***
    .replace(/\bBearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer ***')
    // API keys: (sk|pk|ak)_[alphanumeric]{16,} -> sk_1234...cdef
    .replace(/\b(sk|pk|ak)_[A-Za-z0-9_]{16,}\b/gi, (m) => `${m.slice(0, 7)}...${m.slice(-4)}`)
    // URI credentials with passwords: scheme://user:password@host -> scheme://user:***@host
    .replace(/(:\/\/[^:\s@]*):[^@\s]+(@)/g, '$1:***$2');
}

/**
 * Format financial profit & loss with standardized negative notation:
 * -$X.XX for losses, $X.XX for profits (avoiding inverted $-X.XX).
 */
export function formatCurrencyPnl(amount: number | string): string {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(num) || Math.abs(num) < 0.005) {
    return '$0.00';
  }
  const formatted = Math.abs(num).toFixed(2);
  return num < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function formatCliDiagnostic(err: unknown): CliDiagnosticResult {
  if (err instanceof ZodError || (err && typeof err === 'object' && 'name' in err && err.name === 'ZodError' && 'issues' in err)) {
    const zodErr = err as ZodError;
    const messages = zodErr.issues.map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join('.') : 'option';
      return sanitizeErrorMessage(`  ✖ Invalid --${field}: ${issue.message}`);
    });

    const title = sanitizeErrorMessage('Invalid CLI options');
    logger.error(sanitizeErrorMessage('Invalid CLI options provided:'));
    for (const msg of messages) {
      logger.error(msg);
    }
    return { title, messages };
  }

  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const safeMessage = sanitizeErrorMessage(rawMessage);

  if (rawMessage.includes('ECONNREFUSED')) {
    const messages = [
      sanitizeErrorMessage('  ✖ Could not connect to desk daemon (connection refused).'),
      sanitizeErrorMessage('  → Ensure the desk daemon is active: run `algo-trader desk:auto`'),
    ];
    const title = sanitizeErrorMessage('Desk Daemon Connection Error');
    logger.error('Desk Daemon Connection Error:');
    for (const msg of messages) {
      logger.error(msg);
    }
    return { title, messages };
  }

  const messages = [`  ✖ ${safeMessage}`];
  logger.error(sanitizeErrorMessage(`Command failed: ${safeMessage}`));
  return { title: sanitizeErrorMessage('Command Error'), messages };
}

export function wrapCliAction<T extends unknown[]>(
  fn: (...args: T) => unknown | Promise<unknown>,
  cleanup?: () => unknown | Promise<unknown>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (err) {
      formatCliDiagnostic(err);
      process.exitCode = 1;
    } finally {
      if (cleanup) {
        try {
          await cleanup();
        } catch {
          // Ignore cleanup errors during shutdown drain
        }
      }
    }
  };
}
