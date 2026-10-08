export interface PricePairSeries {
  readonly assetY: string;
  readonly assetX: string;
  readonly pricesY: number[];
  readonly pricesX: number[];
}

export interface CointegrationResult {
  readonly hedgeRatioBeta: number;
  readonly interceptAlpha: number;
  readonly rSquared: number;
  readonly adfTestStatistic: number;
  readonly isCointegrated: boolean;
  readonly residuals: number[];
}

export interface OrnsteinUhlenbeckParams {
  readonly thetaMeanReversionSpeed: number;
  readonly muLongTermMean: number;
  readonly sigmaVolatility: number;
  readonly halfLifeDays: number;
  readonly currentSpread: number;
  readonly currentZScore: number;
  readonly tradeSignal: 'LONG_SPREAD' | 'SHORT_SPREAD' | 'NEUTRAL';
}
