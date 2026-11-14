/**
 * Pure exit-condition evaluation for BasePolymarketStrategy.
 * Extracted from base-polymarket-strategy.ts checkExits()/exitPosition() —
 * no dependencies, no side effects, fully unit-testable.
 *
 * Virtual dispatch note: the class calls this.getCustomExitCondition(...)
 * itself and passes the RESULT here. The custom verdict is never resolved
 * inside this module, so subclass overrides keep working.
 *
 * Evaluation order matches the original checkExits(): TP/SL/maxHold are
 * checked first; the custom verdict is only consulted when none of them
 * fired (pass custom=undefined for the base-only stage — some subclass
 * overrides have side effects, so they must not run when TP/SL already hit).
 */

import type { BaseStrategyConfig, CustomExitVerdict, ExitEvaluation, OpenPosition } from './base-polymarket-strategy-types';

/**
 * Direction-aware fractional gain for a position at a given price.
 * Positions that hold the outcome token directly (`holdsOutcomeToken: true`)
 * profit when that token's price rises regardless of `side`. Legacy positions
 * without `holdsOutcomeToken` treat `side === 'no'` prices as YES quotes
 * (profiting when YES price falls).
 */
export function computePositionGain(pos: OpenPosition, currentPrice: number): number {
  if (!(pos.entryPrice > 0) || !Number.isFinite(pos.entryPrice) || !Number.isFinite(currentPrice)) {
    return 0;
  }
  return pos.holdsOutcomeToken || pos.side === 'yes'
    ? (currentPrice - pos.entryPrice) / pos.entryPrice
    : (pos.entryPrice - currentPrice) / pos.entryPrice;
}

/**
 * Convert the held token's mid price into the YES-equivalent price expected by
 * subclass `getCustomExitCondition` overrides (`1 - noMid` when holding a
 * distinct NO outcome token; unchanged otherwise).
 */
export function resolveCustomExitPrice(pos: OpenPosition, currentPrice: number): number {
  if (pos.holdsOutcomeToken && pos.side === 'no') {
    return Math.max(0, Math.min(1, 1 - currentPrice));
  }
  return currentPrice;
}

/**
 * Evaluate TP/SL/maxHold exit conditions for an open position.
 * Mirrors the original checkExits() math exactly:
 * - gain is direction-aware ('yes' profits when price rises, 'no' when it falls)
 * - take-profit fires when gain >= takeProfitPct
 * - stop-loss fires when -gain >= stopLossPct
 * - max-hold fires when wall-clock elapsed time exceeds maxHoldMs
 * - custom verdict (already resolved by the caller via virtual dispatch)
 *   is only consulted when provided AND none of the above fired
 */
export function evaluateExitCondition(
  pos: OpenPosition,
  currentPrice: number,
  config: BaseStrategyConfig,
  custom: CustomExitVerdict | undefined,
  now: number,
): ExitEvaluation {
  const gain = computePositionGain(pos, currentPrice);

  if (gain >= config.takeProfitPct) {
    return { shouldExit: true, reason: `take-profit (${(gain * 100).toFixed(2)}%)` };
  }
  if (-gain >= config.stopLossPct) {
    return { shouldExit: true, reason: `stop-loss (${(gain * 100).toFixed(2)}%)` };
  }
  if (now - pos.openedAt > config.maxHoldMs) {
    return { shouldExit: true, reason: 'max hold time' };
  }
  if (custom && custom.exit) {
    return { shouldExit: true, reason: custom.reason };
  }
  return { shouldExit: false, reason: '' };
}

/**
 * Compute realized PnL for a closed position, net of entry and exit fees when present.
 * Mirrors the original exitPosition() pnl math while accounting for actual token quantity
 * and venue fees.
 */
export function computeExitPnl(pos: OpenPosition, currentPrice: number, exitFeesUsdc = 0): number {
  const qty = pos.tokenQuantity > 0
    ? pos.tokenQuantity
    : (pos.entryPrice > 0 ? pos.sizeUsdc / pos.entryPrice : 0);
  const gross = pos.holdsOutcomeToken || pos.side === 'yes'
    ? (currentPrice - pos.entryPrice) * qty
    : (pos.entryPrice - currentPrice) * qty;
  const entryFees = pos.entryFeesUsdc ?? 0;
  return gross - entryFees - exitFeesUsdc;
}
