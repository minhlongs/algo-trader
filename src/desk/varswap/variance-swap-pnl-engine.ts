import { VarianceSwapTerms, VarianceSwapPnLResult } from './varswap-types';

export class VarianceSwapPnlEngine {
  public calculatePayoff(
    terms: VarianceSwapTerms,
    realizedVolatilityPct: number,
    volOfVolPct = 80.0
  ): VarianceSwapPnLResult {
    const { strikeVolatilityPct, notionalVegaUsd } = terms;

    const kVol = strikeVolatilityPct / 100.0;
    const realVol = realizedVolatilityPct / 100.0;

    // Variance notional N_var = N_vega / (2 * K_vol)
    const varianceNotionalUsd = notionalVegaUsd / (2.0 * Math.max(0.01, kVol));

    const realizedVar = realVol * realVol;
    const strikeVar = kVol * kVol;

    // Variance swap payoff = N_var * (realizedVar - strikeVar)
    const payoffUsd = varianceNotionalUsd * (realizedVar - strikeVar);

    // Vol swap linear payoff = N_vega * (realizedVol - strikeVol)
    const volSwapApproxPayoffUsd = notionalVegaUsd * (realVol - kVol);

    // Convexity adjustment between vol swap strike and variance swap strike:
    // E[sigma] approx sqrt(K_var) - Var(sigma^2)/(8 * K_var^(3/2))
    const volOfVol = volOfVolPct / 100.0;
    const convexityBps = (volOfVol * volOfVol / (8.0 * Math.max(0.01, kVol))) * 10000.0;

    return {
      realizedVolatilityPct,
      strikeVolatilityPct,
      varianceNotionalUsd: Number(varianceNotionalUsd.toFixed(2)),
      payoffUsd: Number(payoffUsd.toFixed(2)),
      volSwapApproxPayoffUsd: Number(volSwapApproxPayoffUsd.toFixed(2)),
      convexityAdjustmentBps: Number(convexityBps.toFixed(2)),
    };
  }
}
