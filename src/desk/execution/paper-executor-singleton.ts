/**
 * Paper Executor Singleton Lifecycle & Test State Reset
 */

import { unlinkSync } from 'fs';
import type { PaperExecutor } from './paper-executor';
import type { PaperExecutorConfig } from './paper-position-tracker';
import { cashclawPath } from '../../shared/persistence/file-store';

let instance: PaperExecutor | null = null;

export function getPaperExecutorSingleton(
  config?: Partial<PaperExecutorConfig>,
  createFn?: (cfg?: Partial<PaperExecutorConfig>) => PaperExecutor
): PaperExecutor {
  if (!instance && createFn) {
    instance = createFn(config);
  }
  return instance!;
}

export function resetPaperExecutor(): void {
  instance = null;
  try { unlinkSync(cashclawPath('paper-account.json')); } catch {}
  try { unlinkSync(cashclawPath('paper-positions.json')); } catch {}
  try { unlinkSync(cashclawPath('paper-trades.jsonl')); } catch {}
}
