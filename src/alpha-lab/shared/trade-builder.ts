/**
 * Shared Trade Builder
 *
 * Converts triple-barrier labels into BacktestTrade[] with return-on-capital
 * PnL after round-trip fees + slippage. Used by experiment-engine and
 * walkforward-evaluator so both paths produce identical trades.
 *
 * PnL convention: return-on-capital fraction (e.g. 0.02 = +2% of entry
 * capital), comparable across symbols at different price levels.
 *
 * Causal invariant: exit price is derived from the entry bar's close only —
 * no future data enters the trade.
 */

import type { BacktestTrade } from '../../desk/backtesting/types';
import type { CandleLike } from '../regimes/regime-types';
import type { TripleBarrierResult } from '../labeling/triple-barrier';

/** Cost parameters for trade construction. */
export interface TradeBuilderConfig {
  tp: number;
  sl: number;
  feeBps: number;
  slippageBps: number;
}

/**
 * Build trades from triple-barrier labels.
 *
 * @param candles - Full candle array; entry price is taken from the entry bar.
 * @param labels - Labeled entries with their bar index into `candles`.
 * @param config - Take-profit, stop-loss, fee, and slippage parameters.
 * @returns One BacktestTrade per label with net return-on-capital PnL.
 */
export function buildTrades(
  candles: CandleLike[],
  labels: Array<TripleBarrierResult & { entryIdx: number }>,
  config: TradeBuilderConfig,
): BacktestTrade[] {
  const feeMultiplier = config.feeBps / 10000;
  const slipMultiplier = config.slippageBps / 10000;
  const roundTripCost = feeMultiplier + slipMultiplier; // per side; round-trip = 2x

  // A win at tp=0.02 with 5bps fee + 2bps slippage per side nets +0.0186.
  return labels.map((l) => {
    const entryPrice = candles[l.entryIdx].close;
    const isWin = l.label === 1;
    const isLoss = l.label === -1;
    const grossReturn = isWin ? config.tp : isLoss ? -config.sl : 0;
    const cost = roundTripCost * 2; // round-trip: entry + exit
    const netReturn = grossReturn - cost;
    const exitPrice =
      isWin
        ? entryPrice * (1 + config.tp)
        : isLoss
          ? entryPrice * (1 - config.sl)
          : entryPrice;
    return {
      timestamp: candles[l.entryIdx].timestamp,
      tokenId: '',
      side: 'BUY',
      price: exitPrice,
      size: 1,
      pnl: netReturn,
    };
  });
}