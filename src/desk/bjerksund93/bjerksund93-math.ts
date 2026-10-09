export class Bjerksund93Math {
  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  public static normalCdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
        t *
        Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * y);
  }

  public static phi(
    S: number,
    T: number,
    gamma: number,
    H: number,
    I: number,
    r: number,
    b: number,
    v: number
  ): number {
    const lambda = (-r + gamma * b + 0.5 * gamma * (gamma - 1) * v * v) * T;
    const d = -(Math.log(S / H) + (b + (gamma - 0.5) * v * v) * T) / (v * Math.sqrt(T));
    const kappa = (2 * b) / (v * v) + (2 * gamma - 1);
    return (
      Math.exp(lambda) *
      Math.pow(S, gamma) *
      (this.normalCdf(d) -
        Math.pow(I / S, kappa) *
          this.normalCdf(
            d - (2 * Math.log(I / S)) / (v * Math.sqrt(T))
          ))
    );
  }
}
