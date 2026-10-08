export class DuffieSingletonMath {
  /**
   * Computes affine expectation E[exp(-c * int_0^tau lambda_u du)] under CIR intensity process:
   * d lambda = kappa * (theta - lambda) dt + sigma * sqrt(lambda) dW
   */
  public static calcAffineCoefficients(
    tau: number,
    c: number,
    kappa: number,
    theta: number,
    sigma: number
  ): { A: number; B: number } {
    if (tau <= 0.0) {
      return { A: 1.0, B: 0.0 };
    }

    const sigma2 = sigma * sigma;

    // Degenerate case when volatility is negligible (deterministic ODE)
    if (sigma2 < 1e-10) {
      const expKT = Math.exp(-kappa * tau);
      const B = (c / kappa) * (1.0 - expKT);
      const A = Math.exp(-c * theta * (tau - (1.0 - expKT) / kappa));
      return { A, B };
    }

    const gamma = Math.sqrt(kappa * kappa + 2.0 * c * sigma2);
    const expGammaTau = Math.exp(Math.min(50.0, gamma * tau));
    const denom = (gamma + kappa) * (expGammaTau - 1.0) + 2.0 * gamma;

    if (Math.abs(denom) < 1e-12) {
      return { A: 1.0, B: 0.0 };
    }

    const B = (2.0 * c * (expGammaTau - 1.0)) / denom;

    const numA = 2.0 * gamma * Math.exp(Math.min(50.0, (kappa + gamma) * tau * 0.5));
    const ratioA = numA / denom;
    const powerA = (2.0 * kappa * theta) / sigma2;

    const A = Math.pow(Math.max(1e-15, ratioA), powerA);

    return { A, B };
  }

  public static isFellerConditionSatisfied(kappa: number, theta: number, sigma: number): boolean {
    return 2.0 * kappa * theta >= sigma * sigma;
  }
}
