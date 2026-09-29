/**
 * Desk Auto Types & Configuration Schema
 *
 * Defines runtime Zod validation and TypeScript contracts for the
 * Multi-Engine Autonomous Desk Runner (`desk:auto`).
 */

import * as z from 'zod';

export const DeskAutoModeSchema = z.enum(['PAPER', 'SHADOW', 'LIVE']);
export type DeskAutoMode = z.infer<typeof DeskAutoModeSchema>;

export const DeskAutoConfigSchema = z.object({
  mode: DeskAutoModeSchema.default('PAPER'),
  capitalUsd: z.number().positive('Capital must be a positive number').default(100_000),
  dryRun: z.boolean().default(true),
  exchanges: z.array(z.string().min(1)).min(1, 'At least one exchange is required').default([
    'binance',
    'bybit',
    'polymarket',
  ]),
  symbols: z.array(z.string().min(1)).min(1, 'At least one symbol is required').default([
    'BTC/USDT',
    'ETH/USDT',
  ]),
  pollIntervalMs: z.number().int().min(50, 'Poll interval must be at least 50ms').default(1000),
  metricsPort: z.number().int().min(1024, 'Metrics port must be >= 1024').max(65535, 'Metrics port must be <= 65535').default(9100),
  durationSeconds: z.number().int().nonnegative('Duration must be non-negative').optional(),
});

export type DeskAutoConfig = z.infer<typeof DeskAutoConfigSchema>;

export interface IDeskDaemon {
  readonly config: DeskAutoConfig;
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getStatus(): Record<string, unknown>;
}

export interface DeskAutoRunResult {
  config: DeskAutoConfig;
  daemon: IDeskDaemon;
  status: Record<string, unknown>;
}

export interface DeskAutoCliRawOptions {
  mode?: string;
  capital?: string | number;
  capitalUsd?: string | number;
  dryRun?: boolean;
  exchanges?: string | string[];
  symbols?: string | string[];
  pollInterval?: string | number;
  pollIntervalMs?: string | number;
  metricsPort?: string | number;
  duration?: string | number;
  durationSeconds?: string | number;
  confirmed?: boolean;
}

/**
 * Normalizes raw CLI options into standard DeskAutoConfig shape before validation.
 */
export function normalizeDeskAutoOptions(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const input = raw as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  if (typeof input.mode === 'string') {
    output.mode = input.mode.trim().toUpperCase();
  } else if (input.mode !== undefined) {
    output.mode = input.mode;
  }

  const rawCapital = input.capitalUsd ?? input.capital;
  if (typeof rawCapital === 'string') {
    const parsed = Number(rawCapital);
    if (!Number.isNaN(parsed)) output.capitalUsd = parsed;
  } else if (typeof rawCapital === 'number') {
    output.capitalUsd = rawCapital;
  }

  if (typeof input.dryRun === 'boolean') {
    output.dryRun = input.dryRun;
  } else if (typeof input.dryRun === 'string') {
    output.dryRun = input.dryRun !== 'false';
  }

  const rawExchanges = input.exchanges;
  if (typeof rawExchanges === 'string') {
    output.exchanges = rawExchanges
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } else if (Array.isArray(rawExchanges)) {
    output.exchanges = rawExchanges.map(String).filter((s) => s.length > 0);
  }

  const rawSymbols = input.symbols;
  if (typeof rawSymbols === 'string') {
    output.symbols = rawSymbols
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } else if (Array.isArray(rawSymbols)) {
    output.symbols = rawSymbols.map(String).filter((s) => s.length > 0);
  }

  const rawPoll = input.pollIntervalMs ?? input.pollInterval;
  if (typeof rawPoll === 'string') {
    const parsed = Number(rawPoll);
    if (!Number.isNaN(parsed)) output.pollIntervalMs = Math.round(parsed);
  } else if (typeof rawPoll === 'number') {
    output.pollIntervalMs = Math.round(rawPoll);
  }

  const rawPort = input.metricsPort;
  if (typeof rawPort === 'string') {
    const parsed = Number(rawPort);
    if (!Number.isNaN(parsed)) output.metricsPort = Math.round(parsed);
  } else if (typeof rawPort === 'number') {
    output.metricsPort = Math.round(rawPort);
  }

  const rawDuration = input.durationSeconds ?? input.duration;
  if (typeof rawDuration === 'string') {
    const parsed = Number(rawDuration);
    if (!Number.isNaN(parsed)) output.durationSeconds = Math.round(parsed);
  } else if (typeof rawDuration === 'number') {
    output.durationSeconds = Math.round(rawDuration);
  }

  return output;
}

/**
 * Validates and transforms any input into a canonical DeskAutoConfig.
 */
export function parseDeskAutoConfig(raw: unknown): DeskAutoConfig {
  const normalized = normalizeDeskAutoOptions(raw);
  return DeskAutoConfigSchema.parse(normalized);
}
