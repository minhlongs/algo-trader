/**
 * Wave 216: Avellaneda & Lipkin (2003) Hard-to-Borrow & Short Squeeze Types.
 *
 * Implements borrow fees, lender recall buy-in dynamics, and short squeeze feedback.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

export interface AvellanedaLipkinConfig {
  spotPrice: number;                 // S_0 > 0
  freeFloatShares: number;           // Float available
  averageDailyVolume: number;        // ADV shares/day
  shortInterestShares: number;       // Total shorted shares
  annualBorrowFeeRate: number;       // r_b (e.g. 0.12 for 12% borrow fee)
  squeezeTriggerPrice?: number;      // Price threshold where margin calls trigger
  dailyVolatility?: number;          // Daily volatility sigma
  squeezeCouplingCoeff?: number;     // Intensity factor k for squeeze feedback
}

export interface ShortSqueezeSimulationParams {
  horizonDays: number;               // Simulation days T
  intervals?: number;                // Steps N
  initialPriceShockPct?: number;     // Exogenous price jump % (e.g. 15.0 for +15%)
}

export interface SqueezeTrajectoryPoint {
  step: number;
  timeDays: number;
  stockPrice: number;
  borrowFeePct: number;
  forcedBuyInSpeedSharesPerDay: number;
  remainingShortShares: number;
  shortInterestPct: number;
}

export interface AvellanedaLipkinResult {
  spotPrice: number;
  daysToCover: number;
  shortInterestPct: number;
  annualBorrowFeePct: number;
  isSqueezeTriggered: boolean;
  squeezeRegime: 'NOMINAL' | 'ELEVATED_BORROW' | 'ACUTE_SHORT_SQUEEZE';
  terminalPrice: number;
  maxForcedBuyInSpeedSharesPerDay: number;
  trajectory: SqueezeTrajectoryPoint[];
}
