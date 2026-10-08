export interface TradeExecutionPrint {
  readonly timestampMs: number;
  readonly price: number;
  readonly quantity: number;
  readonly aggressorSide: 'BUY' | 'SELL';
}

export interface BookLevelSnapshot {
  readonly timestampMs: number;
  readonly price: number;
  readonly visibleSize: number;
}

export interface IcebergDetectionResult {
  readonly priceLevel: number;
  readonly isIcebergPresent: boolean;
  readonly estimatedDisplaySize: number;
  readonly estimatedHiddenRemaining: number;
  readonly replenishmentCount: number;
  readonly totalExecutedVolume: number;
  readonly confidenceScore: number;
}
