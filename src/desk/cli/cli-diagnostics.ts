/**
 * CLI Diagnostics Formatter
 *
 * Catches ZodError, network timeouts, and daemon connectivity failures,
 * producing actionable user-friendly terminal diagnostics without raw stack traces.
 */

import { ZodError } from 'zod';
import { logger } from '../../shared/utils/logger';

export interface CliDiagnosticResult {
  title: string;
  messages: string[];
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
  fn: (...args: T) => Promise<unknown>,
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

