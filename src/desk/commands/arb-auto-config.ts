/**
 * Configuration builders and user prompt helpers for ARB:AUTO.
 *
 * @module desk/commands/arb-auto-config
 */

import { createInterface } from 'readline';
import type { UnifiedExecutorConfig } from '../arbitrage/unified-executor';

export async function promptConfirmation(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Confirm live trading with real money? (y/N): ', (answer: string) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export function buildExecutionConfig(dryRun: boolean, minSpread: number): UnifiedExecutorConfig {
  return {
    dryRun,
    maxPositionSize: 1000,
    slippageTolerance: 0.5,
    minProfitThreshold: minSpread,
    timeoutMs: 5000,
    binary: {
      kellyFraction: 0.25,
      maxDrawdownPct: 20,
      maxPositionSize: 1000,
      dryRun,
    },
    splitMerge: {
      minProfitThreshold: minSpread,
      minVolume: 1000,
      maxPositionSize: 1000,
      dryRun,
    },
    crossMarket: {
      budgetUsdc: 10000,
      maxMarketExposureFraction: 0.2,
      minEdgeThreshold: minSpread,
      feeRate: 0.001,
      timeoutMs: 5000,
      dryRun,
    },
  };
}
