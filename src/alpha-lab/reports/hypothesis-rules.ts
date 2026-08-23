/**
 * Hypothesis Detection Rules — Barrel Re-export
 *
 * Rules are split by concern:
 *  - hypothesis-rules-risk.ts:    b (stop-loss), c (drawdown), d (profit factor), h (sample size)
 *  - hypothesis-rules-regime.ts:  a (regime), e (seasonality), f (volatility), g (overfitting)
 */

export { detectStopLoss, detectDrawdown, detectProfitFactor, detectSmallSample } from './hypothesis-rules-risk';
export { detectRegimeFilter, detectSeasonality, detectVolatilityDegradation, detectOverfit } from './hypothesis-rules-regime';
