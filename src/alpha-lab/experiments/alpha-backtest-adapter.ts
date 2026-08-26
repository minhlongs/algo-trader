/**
 * Alpha Backtest Adapter
 *
 * Bridges alpha-lab outputs (regime tags, feature vectors, labels) into the
 * existing backtest runner for PnL simulation. This proves that alpha-lab
 * reuses `src/desk/backtesting/backtest-runner.ts` and `src/desk/backtesting/metrics-calculator.ts`
 * rather than duplicating them.
 *
 * At Phase 6+ this becomes the primary integration path. Here it exists to
 * satisfy the reuse contract established in `docs/ALPHA_DISCOVERY_ARCHITECTURE.md`.
 *
 * This adapter emits feature vectors and labels only — it does not produce
 * trades or metrics. Metrics are computed downstream by the experiment engine
 * (experiment-engine.ts), which builds a proper return-on-compounded-capital
 * equity curve. Feeding raw close prices as an equity curve here would make
 * Sharpe/maxDrawdown reflect price movement, not strategy returns.
 */

import type { RegimeSnapshot } from '../regimes/regime-types';
import { classifyRegime, defaultRules } from '../regimes/regime-engine';
import { buildFeatureVector } from '../features/feature-registry';
import { tripleBarrierLabel, type TripleBarrierResult } from '../labeling/triple-barrier';
import { getLatestCandles } from '../../desk/data/ohlcv-store';
import { getFundingRates } from '../../desk/data/funding-store';
import { logger } from '../../shared/utils/logger';
import { generateMockCandles } from './mock-candles';
import type { CandleLike } from '../regimes/regime-types';
import type { FeatureVector } from '../features/feature-types';
import type { DataSourceProvenance } from '../provenance/run-card';

export interface AlphaExperimentConfig {
  market: string;
  timeframe: string;
  lookback: number;
  features: string[];
  tp: number;
  sl: number;
  maxHolding: number;
  regimes?: 'all' | string[];
}

const FUNDING_BPS_OFFSET = 10_000;

/** Market-symbol prefix that routes loadCandles() to the funding_rates table. */
export const FUNDING_SYMBOL_PREFIX = 'BTC-FUNDING-';

/**
 * Human-readable description of the funding-rate → candle transform, recorded
 * in run-card data provenance so funding runs are reproducible from the
 * artifact alone. Single source of truth for both provenance build sites
 * (run-experiment.ts and desk/cli/alpha-helpers.ts).
 */
export function fundingTransformDescription(symbol: string): string {
  return (
    `source table funding_rates (binance-futures); symbol prefix '${FUNDING_SYMBOL_PREFIX}'; ` +
    `close_bps = ${FUNDING_BPS_OFFSET} + fundingRate * 10000; ` +
    `open = previous close (causal chain); high/low = max/min(open, close); volume = 0; ` +
    `underlying symbol ${symbol}`
  );
}

/**
 * Build the data-source provenance entry for a loaded candle series.
 * Funding-prefixed symbols are labelled with their real provider
 * ('funding-store') plus the transform description; everything else keeps the
 * existing ohlcv-store/mock labelling.
 */
export function buildDataSources(
  symbol: string,
  timeframe: string,
  candles: CandleLike[],
  source: 'real' | 'mock',
): DataSourceProvenance[] {
  const now = new Date().toISOString();
  const start = candles.length > 0 ? candles[0].timestamp : now;
  const end = candles.length > 0 ? candles[candles.length - 1].timestamp : now;
  const isFunding = symbol.startsWith(FUNDING_SYMBOL_PREFIX);
  return [
    {
      provider: source === 'real' ? (isFunding ? 'funding-store' : 'ohlcv-store') : 'mock',
      symbol,
      timeframe,
      start,
      end,
      retrievedAt: now,
      candleCount: candles.length,
      ...(isFunding && source === 'real'
        ? { transform: fundingTransformDescription(symbol.replace(FUNDING_SYMBOL_PREFIX, '')) }
        : {}),
    },
  ];
}

/**
 * Load candles for an experiment. Prefers real data from the OHLCV store;
 * falls back to mock data when no real candles exist yet (e.g. before the
 * Binance backfill has run). The fallback is clearly labelled in experiment
 * artifacts so results are never mistaken for real out-of-sample evidence.
 *
 * Special handling for funding-rate series: if market starts with 'BTC-FUNDING-',
 * loads from funding_rates table and derives CandleLike[] via the transform:
 *   timestamp = fundingTime
 *   open = previous close (causal chain)
 *   close = FUNDING_BPS_OFFSET + fundingRate * 10_000
 *   high = max(open, close)
 *   low = min(open, close)
 *   volume = 0
 * Source label is 'real' when loaded from DB; THROWS if table empty for this prefix.
 */
export async function loadCandles(
  market: string,
  timeframe: string,
  candleCount: number,
  exchange = 'binance',
): Promise<{ candles: CandleLike[]; source: 'real' | 'mock' }> {
  // Funding-rate series: load from funding_rates table
  if (market.startsWith(FUNDING_SYMBOL_PREFIX)) {
    const symbol = market.replace(FUNDING_SYMBOL_PREFIX, '');
    // Fetch enough funding rates; they're 8h cadence so candleCount maps directly
    const end = new Date();
    const start = new Date(end.getTime() - candleCount * 8 * 60 * 60 * 1000 - 86_400_000); // extra buffer

    const rates = await getFundingRates(symbol, start, end, 'binance-futures');
    if (rates.length === 0) {
      throw new Error(`[AlphaAdapter] No funding_rates data for ${symbol} (prefix '${FUNDING_SYMBOL_PREFIX}' requires real data — no mock fallback)`);
    }

    // Sort by fundingTime ascending
    rates.sort((a, b) => a.fundingTime.getTime() - b.fundingTime.getTime());

    // Take the last candleCount rates
    const relevant = rates.slice(-candleCount);

    // Transform to CandleLike[]
    const candles: CandleLike[] = [];
    let prevClose: number | null = null;

    for (const rate of relevant) {
      const close = FUNDING_BPS_OFFSET + rate.fundingRate * 10_000;
      const open = prevClose ?? close; // first bar: open = close (no prior)
      const high = Math.max(open, close);
      const low = Math.min(open, close);

      candles.push({
        timestamp: rate.fundingTime.toISOString(),
        open,
        high,
        low,
        close,
        volume: 0,
      });
      prevClose = close;
    }

    return { candles, source: 'real' };
  }

  // Standard OHLCV path
  try {
    const latest = await getLatestCandles(market, timeframe, candleCount, exchange);
    if (latest.length >= 10) {
      return {
        candles: latest.map((c) => ({
          timestamp: c.timestamp.toISOString(),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
        source: 'real',
      };
    }
  } catch (err) {
    // Store may be unreachable in offline/local runs — fall through to mock
    logger.warn('[AlphaAdapter] OHLCV store query failed, using mock data', {
      market,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { candles: generateMockCandles(market, candleCount), source: 'mock' };
}

export interface AlphaRunResult {
  regimeSnapshots: RegimeSnapshot[];
  featureVectors: FeatureVector[];
  labels: Array<TripleBarrierResult & { entryIdx: number }>;
}

export async function runAlphaExperiment(
  candles: CandleLike[],
  config: AlphaExperimentConfig,
): Promise<AlphaRunResult> {
  const rules = defaultRules();
  const regimeSnapshots: RegimeSnapshot[] = [];
  const featureVectors: FeatureVector[] = [];

  for (let i = config.lookback; i < candles.length; i++) {
    const window = candles.slice(i - config.lookback, i + 1);
    const _ts = window[window.length - 1]!.timestamp;

    regimeSnapshots.push(
      classifyRegime(
        { market: config.market, timeframe: config.timeframe, lookback: config.lookback },
        window,
        rules,
      ),
    );

    featureVectors.push(
      buildFeatureVector(
        config.market,
        config.timeframe,
        window,
        config.features,
      ),
    );
  }

  const closes = candles.map((c) => ({
    high: c.high,
    low: c.low,
    close: c.close,
    timestamp: c.timestamp,
  }));
  const labels: Array<TripleBarrierResult & { entryIdx: number }> = [];
  const maxEntry = candles.length - 1 - config.maxHolding;
  for (let i = config.lookback; i <= maxEntry; i++) {
    labels.push({ ...tripleBarrierLabel(closes, i, config.tp, config.sl, config.maxHolding), entryIdx: i });
  }

  // No trades are produced by this adapter — it emits feature vectors and
  // labels only. Metrics are computed downstream by the experiment engine,
  // which builds a proper return-on-compounded-capital equity curve.
  return { regimeSnapshots, featureVectors, labels };
}