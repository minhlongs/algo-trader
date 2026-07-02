/**
 * Prediction Loop — V2 migration compatibility stub.
 *
 * Runs AI-driven prediction cycles to estimate fair values
 * for Polymarket binary options.
 * NOTE: Placeholder for the prediction engine.
 */
import { logger } from '../core/logger';
import type { MarketScanner } from './market-scanner';

export interface PredictionSignal {
  yesTokenId: string;
  direction: 'buy' | 'sell' | 'skip';
  ourProb: number;
  confidence: number;
  edge: number;
  description?: string;
}

export class PredictionLoop {
  constructor(private scanner: MarketScanner) {
    logger.debug('PredictionLoop stub created', 'PredictionLoop');
  }

  async runCycle(): Promise<PredictionSignal[]> {
    return [];
  }
}
