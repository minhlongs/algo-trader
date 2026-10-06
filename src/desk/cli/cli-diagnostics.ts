/**
 * CLI Diagnostics Formatter
 *
 * Catches ZodError, network timeouts, and daemon connectivity failures,
 * producing actionable user-friendly terminal diagnostics without raw stack traces (Rule H4).
 * Also provides standardized currency PnL formatting (-$X.XX vs $-X.XX).
 */

import { ZodError } from 'zod';
import { logger } from '../../shared/utils/logger';

export interface CliDiagnosticResult {
  title: string;
  messages: string[];
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
      return `  ✖ Invalid --${field}: ${issue.message}`;
    });

    logger.error('Invalid CLI options provided:');
    for (const msg of messages) {
      logger.error(msg);
    }
    return { title: 'Invalid CLI options', messages };
  }

  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error');

  if (rawMessage.includes('ECONNREFUSED')) {
    const messages = [
      '  ✖ Could not connect to desk daemon (connection refused).',
      '  → Ensure the desk daemon is active: run `algo-trader desk:auto`',
    ];
    logger.error('Desk Daemon Connection Error:');
    for (const msg of messages) {
      logger.error(msg);
    }
    return { title: 'Desk Daemon Connection Error', messages };
  }

  const messages = [`  ✖ ${rawMessage}`];
  logger.error(`Command failed: ${rawMessage}`);
  return { title: 'Command Error', messages };
}

export function wrapCliAction<T extends unknown[]>(
  fn: (...args: T) => unknown | Promise<unknown>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (err) {
      formatCliDiagnostic(err);
      process.exitCode = 1;
    }
  };
}
