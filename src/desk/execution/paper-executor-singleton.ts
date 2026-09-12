/**
 * Paper Executor Singleton Lifecycle & Test State Reset
 */

import { unlinkSync } from 'fs';
import { homedir } from 'os';
import type { PaperExecutor } from './paper-executor';
import type { PaperExecutorConfig } from './paper-position-tracker';

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
  const home = homedir();
  try { unlinkSync(`${home}/.cashclaw/paper-account.json`); } catch {}
  try { unlinkSync(`${home}/.cashclaw/paper-positions.json`); } catch {}
  try { unlinkSync(`${home}/.cashclaw/paper-trades.jsonl`); } catch {}
}
