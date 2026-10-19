export class MadhavanMath {
  public static calculateTradeAutocorrelation(x: number[]): number {
    const N = x.length;
    let sumProd = 0.0;
    let sumSqCurr = 0.0;
    let sumSqLag = 0.0;

    for (let t = 1; t < N; t++) {
      sumProd += x[t] * x[t - 1];
      sumSqCurr += x[t] * x[t];
      sumSqLag += x[t - 1] * x[t - 1];
    }

    const denom = Math.sqrt(Math.max(1e-12, sumSqCurr * sumSqLag));
    const rho = sumProd / denom;
    return Math.max(-0.95, Math.min(0.95, rho));
  }

  public static estimateOls(deltaP: number[], xCurr: number[], xLag: number[]): { beta1: number; beta2: number; r2: number } {
    const N = deltaP.length;
    let s11 = 0.0;
    let s22 = 0.0;
    let s12 = 0.0;
    let sy1 = 0.0;
    let sy2 = 0.0;
    let syy = 0.0;
    let meanY = 0.0;

    for (let t = 0; t < N; t++) {
      s11 += xCurr[t] * xCurr[t];
      s22 += xLag[t] * xLag[t];
      s12 += xCurr[t] * xLag[t];
      sy1 += deltaP[t] * xCurr[t];
      sy2 += deltaP[t] * xLag[t];
      meanY += deltaP[t];
    }
    meanY /= N;

    for (let t = 0; t < N; t++) {
      syy += Math.pow(deltaP[t] - meanY, 2);
    }

    const det = s11 * s22 - s12 * s12;
    if (Math.abs(det) < 1e-10) {
      return { beta1: 0.0, beta2: 0.0, r2: 0.0 };
    }

    const beta1 = (s22 * sy1 - s12 * sy2) / det;
    const beta2 = (s11 * sy2 - s12 * sy1) / det;

    let ssRes = 0.0;
    for (let t = 0; t < N; t++) {
      const pred = beta1 * xCurr[t] + beta2 * xLag[t];
      ssRes += Math.pow(deltaP[t] - pred, 2);
    }

    const r2 = syy > 1e-10 ? Math.max(0.0, Math.min(1.0, 1.0 - ssRes / syy)) : 0.0;
    return { beta1, beta2, r2 };
  }

  public static decomposeSpread(
    beta1: number,
    beta2: number,
    rho: number
  ): { theta: number; phi: number; s: number; alphaInfo: number } {
    const rawTheta = (beta1 + beta2) / (1.0 - rho);
    const theta = Math.max(0.0, rawTheta);
    const phi = Math.max(0.0, beta1 - theta);
    const s = Math.max(1e-6, theta + phi);
    const alphaInfo = Math.min(1.0, Math.max(0.0, theta / s));

    return { theta, phi, s, alphaInfo };
  }
}
