import { DuffieKanParams } from './duffie-kan-types.js';

export class DuffieKanMath {
  public static solveRiccati(
    speedK: number[],
    theta: number[],
    sigma: number[],
    delta0: number,
    delta1: number[],
    tau: number,
    steps: number = 200
  ): { A: number; B: number[] } {
    const dim = speedK.length;
    const dt = tau / steps;
    const B = new Array<number>(dim).fill(0);
    let A = 0;

    for (let step = 0; step < steps; step++) {
      const dB = new Array<number>(dim);
      let dA = -delta0;

      for (let i = 0; i < dim; i++) {
        dB[i] = -speedK[i] * B[i] + 0.5 * sigma[i] * sigma[i] * B[i] * B[i] - delta1[i];
        dA += speedK[i] * theta[i] * B[i];
      }

      for (let i = 0; i < dim; i++) {
        B[i] += dB[i] * dt;
      }
      A += dA * dt;
    }

    return { A, B };
  }

  public static calculatePrice(
    A: number,
    B: number[],
    stateX: number[]
  ): number {
    let exponent = A;
    for (let i = 0; i < stateX.length; i++) {
      exponent += B[i] * stateX[i];
    }
    return Math.exp(exponent);
  }

  public static calculateYield(price: number, tau: number): number {
    if (tau <= 0) return 0;
    return -Math.log(price) / tau;
  }
}
