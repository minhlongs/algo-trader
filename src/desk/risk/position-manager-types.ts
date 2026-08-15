/**
 * Position Manager types
 * Extracted from position-manager.ts for modularity
 */

export interface PositionConfig {
  maxPositionPerSymbol: number;
  maxPositionPerExchange: number;
  maxTotalExposure: number;
  maxLongExposure: number;
  maxShortExposure: number;
}

export interface Position {
  symbol: string;
  exchange: string;
  side: 'long' | 'short';
  amount: number;
  entryPrice: number;
  currentValue: number;
  unrealizedPnl: number;
  openedAt: number;
}

export interface PositionValidation {
  valid: boolean;
  reason?: string;
  currentExposure: number;
  newExposure: number;
}

export interface ExposureSummary {
  totalLong: number;
  totalShort: number;
  netExposure: number;
  perSymbol: Map<string, number>;
  perExchange: Map<string, number>;
}
