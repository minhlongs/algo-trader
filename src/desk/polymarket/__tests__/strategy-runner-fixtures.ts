/**
 * Strategy Runner Test Fixtures — Tranche 41
 * Shared helpers for strategy-runner test suites.
 */
import * as fs from 'fs';
import { cashclawPath } from '../../../shared/persistence/file-store';
import type { StrategyRunner } from '../strategy-runner';

export const JOURNAL_FILES = [
  'live-trades.jsonl',
  'live-positions.json',
  'live-pnl.json',
  'live-journal.jsonl',
] as const;

export function cleanJournalFiles(): void {
  for (const f of JOURNAL_FILES) {
    try { fs.unlinkSync(cashclawPath(f)); } catch { /* doesn't exist */ }
  }
}

export function makeRunnerConfig(overrides: { tickIntervalMs?: number; maxTicks?: number } = {}) {
  return {
    strategyConfig: { ...overrides }, // spreadMaxReversion overrides injected by caller
    tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
    tickIntervalMs: overrides.tickIntervalMs ?? 500,
    ...(overrides.maxTicks !== undefined ? { maxTicks: overrides.maxTicks } : {}),
  };
}

export async function waitForStop(
  runner: StrategyRunner,
  iterations = 20,
  delayMs = 500,
): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (runner.getStatus().status === 'stopped') break;
  }
}
