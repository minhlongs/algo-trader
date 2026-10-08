export class BkTrinomialTree {
  public static calculateDx(sigma: number, dt: number): number {
    if (sigma <= 0 || dt <= 0) {
      throw new Error('Sigma and dt must be strictly positive');
    }
    return sigma * Math.sqrt(3.0 * dt);
  }

  public static getBranchingProbabilities(
    j: number,
    a: number,
    dt: number
  ): { k: number; pu: number; pm: number; pd: number } {
    // Expected change in standardized state: - a * j * dx * dt
    // In units of dx: eta = - a * j * dt
    const eta = -a * j * dt;
    const k = Math.round(eta); // branching shift center

    const diff = eta - k;
    const diffSq = diff * diff;

    // Standard Hull-White trinomial probabilities around shifted node j + k
    let pu = 1.0 / 6.0 + 0.5 * (diffSq + diff);
    let pm = 2.0 / 3.0 - diffSq;
    let pd = 1.0 / 6.0 + 0.5 * (diffSq - diff);

    // Boundary probability floor protection
    pu = Math.max(0.001, Math.min(0.998, pu));
    pd = Math.max(0.001, Math.min(0.998, pd));
    pm = Math.max(0.001, 1.0 - pu - pd);

    return { k, pu, pm, pd };
  }
}
