/**
 * Reiner-Rubinstein (1991) Single-Barrier Closed-Form Analytical Formulas
 * Implementation of standard A, B, C, D, E, F terms
 */

import { ReinerRubinsteinMath } from './reinerrubinstein-math.js';

export interface RRFormulaTerms {
  A: (phi: number) => number;
  B: (phi: number) => number;
  C: (phi: number, eta: number) => number;
  D: (phi: number, eta: number) => number;
  E: (eta: number) => number;
  F: (eta: number) => number;
}

export function computeFormulaTerms(
  S: number,
  K: number,
  H: number,
  T: number,
  r: number,
  b: number,
  sigma: number,
  R: number,
  mu: number,
  lambda: number
): RRFormulaTerms {
  const sqrtT = Math.sqrt(T);
  const sigSqrtT = sigma * sqrtT;

  const x1 = Math.log(S / K) / sigSqrtT + (1 + mu) * sigSqrtT;
  const x2 = Math.log(S / H) / sigSqrtT + (1 + mu) * sigSqrtT;
  const y1 = Math.log((H * H) / (S * K)) / sigSqrtT + (1 + mu) * sigSqrtT;
  const y2 = Math.log(H / S) / sigSqrtT + (1 + mu) * sigSqrtT;
  const z = Math.log(H / S) / sigSqrtT + lambda * sigSqrtT;

  const discR = Math.exp(-r * T);
  const carryFac = Math.exp((b - r) * T);

  return {
    A: (phi: number) => {
      const term1 = phi * S * carryFac * ReinerRubinsteinMath.normalCdf(phi * x1);
      const term2 = phi * K * discR * ReinerRubinsteinMath.normalCdf(phi * (x1 - sigSqrtT));
      return term1 - term2;
    },
    B: (phi: number) => {
      const term1 = phi * S * carryFac * ReinerRubinsteinMath.normalCdf(phi * x2);
      const term2 = phi * K * discR * ReinerRubinsteinMath.normalCdf(phi * (x2 - sigSqrtT));
      return term1 - term2;
    },
    C: (phi: number, eta: number) => {
      const pRatio = Math.pow(H / S, 2 * (mu + 1));
      const term1 = phi * S * carryFac * pRatio * ReinerRubinsteinMath.normalCdf(eta * y1);
      const term2 = phi * K * discR * Math.pow(H / S, 2 * mu) * ReinerRubinsteinMath.normalCdf(eta * (y1 - sigSqrtT));
      return term1 - term2;
    },
    D: (phi: number, eta: number) => {
      const pRatio = Math.pow(H / S, 2 * (mu + 1));
      const term1 = phi * S * carryFac * pRatio * ReinerRubinsteinMath.normalCdf(eta * y2);
      const term2 = phi * K * discR * Math.pow(H / S, 2 * mu) * ReinerRubinsteinMath.normalCdf(eta * (y2 - sigSqrtT));
      return term1 - term2;
    },
    E: (eta: number) => {
      if (R === 0) return 0;
      const term1 = ReinerRubinsteinMath.normalCdf(eta * (x2 - sigSqrtT));
      const term2 = Math.pow(H / S, 2 * mu) * ReinerRubinsteinMath.normalCdf(eta * (y2 - sigSqrtT));
      return R * discR * (term1 - term2);
    },
    F: (eta: number) => {
      if (R === 0) return 0;
      const p1 = Math.pow(H / S, mu + lambda);
      const p2 = Math.pow(H / S, mu - lambda);
      const term1 = p1 * ReinerRubinsteinMath.normalCdf(eta * z);
      const term2 = p2 * ReinerRubinsteinMath.normalCdf(eta * (z - 2 * lambda * sigSqrtT));
      return R * (term1 + term2);
    },
  };
}
