export interface AndersenBollerslev1998Input {
  readonly intradaySessionFraction: number;
  readonly rawFiveMinReturnSq: number;
  readonly dailyGarchVarianceForecast: number;
  readonly diurnalUShapeAmplitude: number;
  readonly harmonicDecayAlpha: number;
}

export interface AndersenBollerslev1998Output {
  readonly diurnalSeasonalityFactor: number;
  readonly deseasonalizedReturnVariance: number;
  readonly highFrequencyShockRatio: number;
  readonly annualizedRealizedVol: number;
  readonly regimeState: 'QUIET_MIDDAY' | 'NORMAL_DIURNAL' | 'OPEN_CLOSE_BURST';
}
