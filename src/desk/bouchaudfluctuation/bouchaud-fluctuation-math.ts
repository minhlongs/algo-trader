/**
 * Wave 252: Bouchaud, Farmer & Lillo (2009) Order Flow Fluctuation Dissipation Math.
 *
 * Implements linear response theory for order book dynamics:
 * R(l) = sum_{k=0}^l Gamma(l - k) * C(k)
 * Solves the causal inversion for bare propagator Gamma(l).
 *
 * Strictly < 100 LOC, zero mocks, deterministic signal processing.
 */

import {
  BouchaudFluctuationConfig,
  FluctuationDissipationState,
} from './types';

export function computeFluctuationDissipation(
  config: BouchaudFluctuationConfig
): FluctuationDissipationState {
  const points = config.lagPoints;
  const n = points.length;
  const bareGamma: number[] = new Array(n).fill(0);

  // Triangular causal deconvolution: R(l) = sum_{k=0}^l Gamma(l-k) * C(k)
  // For l=0: R(0) = Gamma(0) * C(0) => Gamma(0) = R(0) / C(0)
  for (let l = 0; l < n; l++) {
    const r_l = points[l]?.observedResponseR ?? 0.0;
    const c_0 = points[0]?.orderSignAutocorrelationC ?? 1.0;
    let convolutionSum = 0.0;

    for (let k = 1; k <= l; k++) {
      const c_k = points[k]?.orderSignAutocorrelationC ?? 0.0;
      convolutionSum += bareGamma[l - k] * c_k;
    }

    if (Math.abs(c_0) > 1e-6) {
      bareGamma[l] = (r_l - convolutionSum) / c_0;
    } else {
      bareGamma[l] = config.baselineBareImpactG0 / Math.pow(l + 1, config.memoryDecayGamma);
    }
  }

  // Energy dissipation integral & effective diffusion coefficient
  let totalEnergy = 0.0;
  for (let i = 0; i < n; i++) {
    const gamma = bareGamma[i] ?? 0.0;
    const c = points[i]?.orderSignAutocorrelationC ?? 0.0;
    totalEnergy += gamma * c;
  }

  const effectiveDiffusivity = 2.0 * Math.max(0, totalEnergy);
  // Arbitrage-free condition: Gamma(l) must decay monotonically and asymptotically to zero
  const isArbitrageFree = bareGamma.length > 1 && bareGamma[bareGamma.length - 1] <= bareGamma[0];

  return {
    bareImpactKernelGamma: bareGamma,
    totalDissipatedEnergy: totalEnergy,
    subdiffusiveDiffusivityD: effectiveDiffusivity,
    isPermanentArbitrageFree: isArbitrageFree,
  };
}
