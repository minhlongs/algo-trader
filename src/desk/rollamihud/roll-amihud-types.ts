export interface MarketTradePoint {
  readonly timestamp: number;
  readonly price: number;
  readonly volume: number;
  readonly tradeDirection?: 1 | -1; // +1 = buy, -1 = sell
}

export interface RollSpreadResult {
  readonly autocovariance: number;
  readonly effectiveSpread: number;
  readonly effectiveSpreadPct: number;
  readonly hasNegativeAutocovariance: boolean;
  readonly rollModifiedSpread: number;
}

export type LiquidityRegime =
  | 'HIGH_LIQUIDITY'
  | 'NORMAL'
  | 'ELEVATED_IMPACT'
  | 'ILLIQUID_DISTRESSED';

export interface AmihudIlliqResult {
  readonly rawAmihudRatio: number;
  readonly scaledAmihudRatio: number; // Scaled by 1e6
  readonly averageAbsoluteReturnPct: number;
  readonly averageDollarVolume: number;
  readonly liquidityRegime: LiquidityRegime;
}

export interface PriceImpactResult {
  readonly kyleLambdaProxy: number;
  readonly rSquared: number;
}

export interface UnifiedLiquidityReport {
  readonly rollSpread: RollSpreadResult;
  readonly amihud: AmihudIlliqResult;
  readonly impact: PriceImpactResult;
  readonly compositeLiquidityScore: number; // 0 to 100
}
