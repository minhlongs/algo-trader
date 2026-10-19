/**
 * Wave 222: Bouchaud et al. (2004) Propagator Model of Stock Market Liquidity Types.
 *
 * Implements non-Markovian order flow price impact via power-law propagator kernel.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

export interface PropagatorKernelConfig {
  bareImpactGamma0: number;       // Gamma_0 baseline impact coefficient
  decayExponentGamma: number;     // gamma in (0, 0.5] (e.g. 0.25)
  characteristicTimeScaleTau0Sec: number; // tau_0 memory cutoff scale
  volumePowerAlpha?: number;      // alpha power law on volume (default 0.5 for square root)
}

export interface TradeOrderFlowEvent {
  timestampSec: number;           // Event time t_s
  orderSign: 1 | -1;              // +1 buy, -1 sell
  orderVolumeShares: number;      // Trade size v_s
}

export interface PropagatorImpactTrajectoryPoint {
  timeSec: number;
  cumulativeImpactPrice: number;
  instantaneousDecayFactor: number;
  orderFlowImbalance: number;
}
