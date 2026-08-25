export {
  computeRegimeFeatures,
  classifyRegime,
  defaultRules,
  realizedVolatility,
  averageTrueRange,
  closeSlope,
  trendStrength,
  returnDispersion,
  volumeAbnormality,
  pickRegime,
  buildExplanation,
} from './regime-engine';
export {
  computeRegimeSeries,
  distinctRegimes,
} from './regime-series';
export type {
  CandleLike,
  MarketRegime,
  RegimeFeatures,
  RegimeSnapshot,
  RegimeClassifierOptions,
  RegimeRule,
} from './regime-types';
export type { RegimeSeriesOptions } from './regime-series';
