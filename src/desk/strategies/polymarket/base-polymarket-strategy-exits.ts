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
 * 'yes' profits when price rises, 'no' when it falls.
 */
export function computePositionGain(pos: OpenPosition, currentPrice: number): number {
  return pos.side === 'yes'
    ? (currentPrice - pos.entryPrice) / pos.entryPrice
    : (pos.entryPrice - currentPrice) / pos.entryPrice;
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
 * Compute realized PnL for a closed position.
 * Mirrors the original exitPosition() pnl math exactly.
 */
export function computeExitPnl(pos: OpenPosition, currentPrice: number): number {
  return pos.side === 'yes'
    ? (currentPrice - pos.entryPrice) * (pos.sizeUsdc / pos.entryPrice)
    : (pos.entryPrice - currentPrice) * (pos.sizeUsdc / pos.entryPrice);
}
