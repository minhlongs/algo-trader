/**
 * AI/ML Signal Adapter Types
 */

import type { MarketRegime } from '../../alpha-lab/regimes/regime-types';

export interface AISignalConfig {
  confidenceThreshold: number;
  minExpectancy: number;
  regimeFilter?: MarketRegime[];
}

export interface AISignal {
  strategyId?: string;
  signalId?: string;
  direction?: 'BUY' | 'SELL';
  action?: 'BUY' | 'SELL';
  symbol?: string;
  confidence: number;
  expectancy: number;
  regime: MarketRegime;
  timestamp: number;
}

export interface AISignalValidationResult {
  valid: boolean;
  signal: AISignal;
  rejectionReasons: string[];
}
