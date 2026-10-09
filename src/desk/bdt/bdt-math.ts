/**
 * Black-Derman-Toy (1990) Log-Normal Lattice Calibration Mathematics
 *
 * In BDT:
 * r(i, j) = U_i * exp(2 * j * sigma_i * sqrt(dt))
 * or r(i, j) = r_i0 * k_i^j where k_i = exp(2 * sigma_i * sqrt(dt)).
 *
 * State prices (Arrow-Debreu prices) Q(i, j):
 * Q(0, 0) = 1
 * Q(i, j) computed recursively:
 * Q(i+1, j) = 0.5 * Q(i, j-1) / (1 + r(i, j-1)*dt) + 0.5 * Q(i, j) / (1 + r(i, j)*dt)
 */

export class BDTMath {
  /**
   * Price a zero-coupon bond maturing at step n using baseline rate r0 and growth factor k
   */
  public static computeBondPriceFromBaseRate(
    prevQ: number[],
    prevRates: number[],
    r0: number,
    k: number,
    dt: number,
    step: number
  ): { price: number; nextQ: number[] } {
    const nextQ: number[] = new Array(step + 1).fill(0);

    for (let j = 0; j < prevQ.length; j++) {
      const discount = 1.0 / (1.0 + prevRates[j] * dt);
      const discountedQ = 0.5 * prevQ[j] * discount;
      nextQ[j] += discountedQ;
      nextQ[j + 1] += discountedQ;
    }

    // Price of ZCB maturing at step using nextQ and rates at step:
    let price = 0;
    for (let j = 0; j <= step; j++) {
      const rate = r0 * Math.pow(k, j);
      price += nextQ[j] / (1.0 + rate * dt);
    }

    return { price, nextQ };
  }

  /**
   * Root-find base rate r_0 at step such that theoretical ZCB price matches target discount factor P(0, step+1)
   */
  public static solveBaseRate(
    targetDiscount: number,
    prevQ: number[],
    prevRates: number[],
    sigma: number,
    dt: number,
    step: number
  ): { r0: number; nextQ: number[]; rates: number[] } {
    const k = Math.exp(2.0 * sigma * Math.sqrt(dt));

    let low = 0.00001;
    let high = 2.0;
    let r0 = 0.05;

    for (let iter = 0; iter < 100; iter++) {
      r0 = 0.5 * (low + high);
      const { price } = this.computeBondPriceFromBaseRate(prevQ, prevRates, r0, k, dt, step);

      if (Math.abs(price - targetDiscount) < 1e-12) {
        break;
      }

      if (price > targetDiscount) {
        // Price is too high -> interest rates need to be higher
        low = r0;
      } else {
        high = r0;
      }
    }

    const rates: number[] = [];
    for (let j = 0; j <= step; j++) {
      rates.push(r0 * Math.pow(k, j));
    }

    // Calculate nextQ
    const nextQ: number[] = new Array(step + 1).fill(0);
    for (let j = 0; j < prevQ.length; j++) {
      const discount = 1.0 / (1.0 + prevRates[j] * dt);
      const discountedQ = 0.5 * prevQ[j] * discount;
      nextQ[j] += discountedQ;
      nextQ[j + 1] += discountedQ;
    }

    return { r0, nextQ, rates };
  }
}
