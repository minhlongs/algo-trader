/**
 * Wave 214: Almgren, Thum, Hauptmann & Li (2005) Non-Linear Market Impact Types.
 *
 * Implements square-root law for temporary impact and linear permanent impact:
 * g(nu) = eta * sigma * (|nu| / V)^alpha * sgn(nu) with alpha = 0.5.
 * J(x) = gamma * sigma * (x / V).
 * Strictly < 180 LOC, zero mocks, zero :any.
 */

export interface AlmgrenThumConfig {
  dailyVolatility: number;       // sigma > 0 (e.g. 0.02 for 2% daily vol)
  averageDailyVolume: number;    // V > 0 shares
  tempImpactCoeff?: number;      // eta > 0 (typically ~0.142)
  tempImpactExponent?: number;   // alpha in (0, 1] (canonical ~0.5 square root)
  permImpactCoeff?: number;      // gamma > 0 (typically ~0.314)
}

export interface AlmgrenThumOrder {
  totalShares: number;           // Total meta-order size X > 0
  executionHorizonDays: number;  // Horizon T > 0 in trading days (e.g. 0.5 = 3.25 hours)
  intervals?: number;            // Discretization intervals N (default: 50)
  participationRateCap?: number; // Max nu / (V / T) (e.g. 0.15 for 15% POV)
}

export interface TrajectoryPoint {
  step: number;
  timeDays: number;
  remainingShares: number;
  tradeSpeedSharesPerDay: number;
  temporaryImpactFraction: number;
  permanentImpactFraction: number;
  instantaneousSlippageBps: number;
}

export interface AlmgrenThumResult {
  totalShares: number;
  horizonDays: number;
  expectedTemporaryImpactBps: number;
  expectedPermanentImpactBps: number;
  totalImplementationShortfallBps: number;
  averageTradeSpeedSharesPerDay: number;
  maxParticipationRatePct: number;
  isConcaveImpactObserved: boolean;
  status: 'OPTIMAL_EXECUTION' | 'POV_CONSTRAINED' | 'EXCESSIVE_SLIPPAGE';
  trajectory: TrajectoryPoint[];
}
