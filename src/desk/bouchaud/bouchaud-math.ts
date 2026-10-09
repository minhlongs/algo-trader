import { ResponsePoint, EfficiencyRegime } from './bouchaud-types';

export class BouchaudMath {
  public static signAutocorrelation(lag: number, gamma: number, c0 = 1.0): number {
    if (lag === 0) return 1.0;
    return c0 * Math.pow(1.0 + lag, -gamma);
  }

  public static barePropagator(lag: number, beta: number, gamma0 = 1.0): number {
    return gamma0 * Math.pow(1.0 + lag, -beta);
  }

  public static computeDressedResponse(
    lag: number,
    beta: number,
    gamma: number,
    gamma0 = 1.0,
    c0 = 1.0
  ): number {
    const g0 = this.barePropagator(lag, beta, gamma0);
    let conv = 0.0;
    for (let j = 1; j <= lag; j++) {
      const gDecay = this.barePropagator(lag - j, beta, gamma0);
      const cLag = this.signAutocorrelation(j, gamma, c0);
      conv += gDecay * cLag;
    }
    return g0 + conv;
  }

  public static evaluateRegime(beta: number, gamma: number): {
    regime: EfficiencyRegime;
    error: number;
    isArbitrageFree: boolean;
  } {
    const theoreticalBeta = (1.0 - gamma) / 2.0;
    const error = Math.abs(beta - theoreticalBeta);

    let regime: EfficiencyRegime = 'EFFICIENT_DIFFUSIVE';
    if (beta > theoreticalBeta + 0.05) {
      regime = 'SUBDIFFUSIVE_REVERSAL';
    } else if (beta < theoreticalBeta - 0.05) {
      regime = 'SUPERDIFFUSIVE_TRENDING';
    }

    const isArbitrageFree = regime === 'EFFICIENT_DIFFUSIVE';
    return { regime, error, isArbitrageFree };
  }

  public static simulatePriceImpact(
    orderSigns: number[],
    beta: number,
    gamma0 = 1.0
  ): number[] {
    const n = orderSigns.length;
    const prices: number[] = new Array(n).fill(0.0);
    let currentShift = 0.0;

    for (let i = 0; i < n; i++) {
      let impactAtI = 0.0;
      for (let j = 0; j <= i; j++) {
        const sign = orderSigns[j]!;
        const lag = i - j;
        impactAtI += sign * this.barePropagator(lag, beta, gamma0);
      }
      prices[i] = impactAtI;
    }

    return prices;
  }
}
