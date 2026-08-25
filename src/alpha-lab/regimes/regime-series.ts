import type { CandleLike, MarketRegime, RegimeClassifierOptions, RegimeRule } from './regime-types';
import { classifyRegime, defaultRules } from './regime-engine';

export interface RegimeSeriesOptions {
  market: string;
  timeframe: string;
  lookback: number;
  rules?: RegimeRule[];
}

/** Compute one causal market regime per candle. */
export function computeRegimeSeries(
  candles: CandleLike[],
  opts: RegimeSeriesOptions,
): MarketRegime[] {
  const rules = opts.rules ?? defaultRules();
  const classifierOpts: RegimeClassifierOptions = {
    market: opts.market,
    timeframe: opts.timeframe,
    lookback: opts.lookback,
  };

  return candles.map((_, i) => {
    const window = candles.slice(Math.max(0, i - opts.lookback), i + 1);
    return classifyRegime(classifierOpts, window, rules).regime;
  });
}

/** Return deterministic, de-duplicated regimes for artifact attribution. */
export function distinctRegimes(regimes: MarketRegime[]): MarketRegime[] {
  return Array.from(new Set(regimes)).sort();
}
