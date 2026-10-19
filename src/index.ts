/**
 * Algo Trader - Main entry point
 * Algorithmic trading platform with zero-config onboarding
 */

import 'dotenv/config';
import { Command } from 'commander';
import { initSentry } from './utils/sentry-init';
import { initTracing } from './utils/tracing';
import { runMigrations } from './db/migration-runner';
import { logger } from './shared/utils/logger';
import { buildCliProgram as buildCliProgramFn, type ArbAutoOptions } from './commands/cli-builder';

// Re-export CLI types and builder
export type { ArbAutoOptions };
export { buildCliProgramFn as buildCliProgram };

// Initialize Sentry before anything else
initSentry();

// Initialize OTel tracing (noop if OTEL_EXPORTER_OTLP_ENDPOINT unset).
initTracing().catch((err) => logger.warn('[Startup] initTracing failed', { err }));

export const version = '1.0.0';

export function main(): void {
  logger.info(`Algo Trader v${version} started`);
  runMigrations().catch((err) => {
    logger.warn('[Startup] Migration runner skipped (DB may not be configured):', { err });
  });
}

const isTest = process.env.NODE_ENV === 'test' || process.argv.includes('vitest');

if (!isTest) {
  const program = buildCliProgramFn(version);
  program.parse(process.argv);
  if (!process.argv.slice(2).length) {
    main();
    program.help();
  }
}

