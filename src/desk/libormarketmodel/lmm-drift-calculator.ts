import { LmmTenorStructure, LmmVolatilitySpec } from './lmm-types';

export class LmmDriftCalculator {
  /**
   * Calculates the drift mu_i(t) of forward rate L_i under the terminal measure Q^{T_M}
   * mu_i(t) = - sum_{j = i+1}^{M} [ (tau_j * L_j(t)) / (1 + tau_j * L_j(t)) ] * sigma_i * sigma_j * rho_{i, j}
   */
  public static calculateTerminalMeasureDrift(
    i: number,
    forwardRates: number[],
    tenors: LmmTenorStructure,
    vols: LmmVolatilitySpec
  ): number {
    const M = forwardRates.length - 1;
    if (i >= M) {
      return 0.0; // Terminal forward rate is a martingale under terminal measure
    }

    let drift = 0.0;
    const sigma_i = vols.volatilities[i]!;

    for (let j = i + 1; j <= M; j++) {
      const tau_j = tenors.yearFractions[j]!;
      const L_j = forwardRates[j]!;
      const sigma_j = vols.volatilities[j]!;
      const rho_ij = vols.correlationMatrix[i]![j]!;

      const ratio = (tau_j * L_j) / (1.0 + tau_j * L_j);
      drift -= ratio * sigma_i * sigma_j * rho_ij;
    }

    return drift;
  }

  /**
   * Cumulative discount ratio from T_k to terminal tenor T_M:
   * P(T_k, T_M) = prod_{j = k+1}^M 1 / (1 + tau_j * L_j)
   * 1 / P(T_k, T_M) = prod_{j = k+1}^M (1 + tau_j * L_j)
   */
  public static computeTerminalRatioInverse(
    k: number,
    forwardRates: number[],
    tenors: LmmTenorStructure
  ): number {
    const M = forwardRates.length - 1;
    let ratio = 1.0;
    for (let j = k + 1; j <= M; j++) {
      const tau_j = tenors.yearFractions[j]!;
      const L_j = forwardRates[j]!;
      ratio *= 1.0 + tau_j * L_j;
    }
    return ratio;
  }
}
