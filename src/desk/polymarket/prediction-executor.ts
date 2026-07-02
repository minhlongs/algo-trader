/**
 * Prediction Executor — V2 migration compatibility stub.
 *
 * Executes directional trades based on AI prediction signals.
 * NOTE: Placeholder for the AI-driven trade executor.
 */
import { logger } from '../core/logger';
import type { ClobClient } from './clob-client';
import type { PredictionSignal } from './prediction-loop';

export interface PredictionExecutorConfig {
  capitalUsdc: number;
  maxPositionFraction: number;
  kellyFraction: number;
  dryRun: boolean;
}

export class PredictionExecutor {
  constructor(
    private clobClient: ClobClient,
    private license: { tier: string; maxTradesPerDay: number; features: string[] },
    private config: PredictionExecutorConfig,
  ) {
    logger.debug('PredictionExecutor stub created', 'PredictionExecutor');
  }

  async executeSignals(_signals: PredictionSignal[]): Promise<Array<{ sizeUsdc: number; tokenId: string }>> {
    return [];
  }
}
