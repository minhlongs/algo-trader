export { BacktestRunner } from './backtest-runner';
export { GammaHistoricalProvider } from './gamma-historical-provider';
export { computeMetrics, computeMaxDrawdown, computeSharpeRatio, computeProfitFactor } from './metrics-calculator';
export type {
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  MetricsReport,
  HistoricalSnapshot,
  HistoricalMarketData,
} from './types';
