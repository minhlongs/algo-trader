import { VannaVolgaMarket, VannaVolgaResult } from './vanna-volga-types';
import { BlackScholesHelper } from './black-scholes-helper';

export class VannaVolgaEngine {
  /**
   * Interpolates the implied volatility for a target strike K using the Vanna-Volga pricing methodology.
   * Based on Castagna & Mercurio (2006).
   */
  public static interpolateVolatility(market: VannaVolgaMarket, targetStrike: number): VannaVolgaResult {
    const S = market.spotPrice;
    const T = market.timeToMaturity;
    const r = market.domesticRate;
    const q = market.foreignRate;
    const atmVol = market.volAtm;

    // The 3 anchor strikes ordered K1 (Put) < K2 (ATM) < K3 (Call)
    const K1 = market.strike25DeltaPut;
    const K2 = market.strikeAtm;
    const K3 = market.strike25DeltaCall;

    const vol1 = market.vol25DeltaPut;
    const vol2 = market.volAtm;
    const vol3 = market.vol25DeltaCall;

    // Approximation weights:
    const lnK_K1 = Math.log(targetStrike / K1);
    const lnK_K2 = Math.log(targetStrike / K2);
    const lnK_K3 = Math.log(targetStrike / K3);

    const lnK2_K1 = Math.log(K2 / K1);
    const lnK3_K1 = Math.log(K3 / K1);
    const lnK3_K2 = Math.log(K3 / K2);

    const weight1 = (lnK_K2 * lnK_K3) / (lnK2_K1 * lnK3_K1);
    const weight2 = (lnK_K1 * lnK_K3) / (-lnK2_K1 * lnK3_K2); 
    const weight3 = (lnK_K1 * lnK_K2) / (lnK3_K1 * lnK3_K2);

    // D1, D2 using ATM vol for correction terms
    const d1_1 = BlackScholesHelper.d1(S, K1, r, q, T, atmVol);
    const d2_1 = BlackScholesHelper.d2(S, K1, r, q, T, atmVol);
    
    const d1_2 = BlackScholesHelper.d1(S, K2, r, q, T, atmVol);
    const d2_2 = BlackScholesHelper.d2(S, K2, r, q, T, atmVol);
    
    const d1_3 = BlackScholesHelper.d1(S, K3, r, q, T, atmVol);
    const d2_3 = BlackScholesHelper.d2(S, K3, r, q, T, atmVol);
    
    const d1_K = BlackScholesHelper.d1(S, targetStrike, r, q, T, atmVol);
    const d2_K = BlackScholesHelper.d2(S, targetStrike, r, q, T, atmVol);

    // Compute the enhanced Vanna-Volga indicator weights D(K)
    const D1_K = d1_K * d2_K;
    const D1_1 = d1_1 * d2_1;
    const D1_2 = d1_2 * d2_2;
    const D1_3 = d1_3 * d2_3;

    let x1 = weight1;
    let x2 = weight2;
    let x3 = weight3;

    // Avoid exploding corrections if D(K) near zero
    if (Math.abs(D1_K) > 1e-6) {
      if (Math.abs(D1_1) > 1e-6) x1 = weight1 * (D1_K / D1_1);
      if (Math.abs(D1_2) > 1e-6) x2 = weight2 * (D1_K / D1_2);
      if (Math.abs(D1_3) > 1e-6) x3 = weight3 * (D1_K / D1_3);
    }
    
    // We incorrectly sum the squared vols in variance space when some x are negative, 
    // which caused the logic defect flag because the final var blows up. 
    // The standard first-order Castagna-Mercurio formula for Vol is:
    // Vol(K) = vol_ATM + x1*(vol1 - vol_ATM) + x3*(vol3 - vol_ATM) 
    // Or in full variance space (less common but robust if carefully constructed):
    
    // Let's use the explicit first-order definition for safety:
    const vvSigmaTarget = vol2 + x1 * (vol1 - vol2) + x3 * (vol3 - vol2);

    return {
      interpolatedVol: vvSigmaTarget,
      targetStrike,
      weight1: x1,
      weight2: x2,
      weight3: x3
    };
  }
}
