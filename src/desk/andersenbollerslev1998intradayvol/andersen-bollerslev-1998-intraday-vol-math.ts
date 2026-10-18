import { AndersenBollerslev1998Input, AndersenBollerslev1998Output } from './types';

/**
 * Wave 331: Andersen & Bollerslev (1998) Intraday Diurnal U-Shape Volatility & Realized Filter.
 * Models flexible Fourier form (FFF) diurnal seasonality s(u) on [0, 1] trading session.
 */
export class AndersenBollerslev1998IntradayVol {
  public evaluate(input: AndersenBollerslev1998Input): AndersenBollerslev1998Output {
    const u = Math.min(1, Math.max(0, input.intradaySessionFraction));
    const amp = Math.max(0, input.diurnalUShapeAmplitude);
    const harmonic =
      Math.cos(2 * Math.PI * u) + 0.35 * Math.exp(-input.harmonicDecayAlpha * u) * Math.cos(4 * Math.PI * u);

    const diurnalSeasonalityFactor = Number(
      Math.max(0.25, 1 + amp * harmonic).toFixed(6),
    );
    const deseasonalizedReturnVariance = Number(
      (Math.max(0, input.rawFiveMinReturnSq) / diurnalSeasonalityFactor).toFixed(8),
    );
    const intervalForecast = Math.max(1e-10, input.dailyGarchVarianceForecast / 288);
    const highFrequencyShockRatio = Number(
      (deseasonalizedReturnVariance / intervalForecast).toFixed(4),
    );
    const annualizedRealizedVol = Number(
      Math.sqrt(deseasonalizedReturnVariance * 288 * 365).toFixed(6),
    );

    const regimeState =
      diurnalSeasonalityFactor >= 1.25
        ? 'OPEN_CLOSE_BURST'
        : diurnalSeasonalityFactor <= 0.85
          ? 'QUIET_MIDDAY'
          : 'NORMAL_DIURNAL';

    return {
      diurnalSeasonalityFactor,
      deseasonalizedReturnVariance,
      highFrequencyShockRatio,
      annualizedRealizedVol,
      regimeState,
    };
  }
}
