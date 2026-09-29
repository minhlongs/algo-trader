import type { EngineId } from '../../../../src/desk/portfolio/types';

export type CircuitBreakerTier = 'NORMAL' | 'ALERT' | 'REDUCE' | 'HALT' | 'HARD_STOP';

export interface CircuitBreakerState {
  readonly tier: CircuitBreakerTier;
  readonly peakToTroughDrawdown: number;
  readonly meanCorrelation: number;
  readonly grossLeverage: number;
  readonly triggeredAt: number;
  readonly reason: string;
}

export interface EngineRiskAdapter {
  readonly engineId: EngineId;
  notifyCircuitBreaker(state: CircuitBreakerState): Promise<void>;
  reducePositions(reductionFactor: number): Promise<void>;
  haltTrading(): Promise<void>;
  emergencyHardStop(): Promise<void>;
}

export interface VarCvarResult {
  readonly parametricVaR: number;
  readonly parametricCVaR: number;
  readonly historicalVaR: number;
  readonly historicalCVaR: number;
  readonly confidence: number;
  readonly horizonDays: number;
  readonly portfolioNav: number;
}

export interface TailDivergenceResult {
  readonly ratio: number;
  readonly isTailDivergent: boolean;
  readonly parametricCVaR: number;
  readonly historicalCVaR: number;
}

export interface LeverageCheckResult {
  readonly grossLeverage: number;
  readonly netExposure: number;
  readonly isAllowed: boolean;
  readonly maxAllowedLeverage: number;
  readonly violationReason?: string;
}

export function computeVarCvar(
  returns: readonly number[],
  portfolioNav: number,
  confidence: 0.95 | 0.99 = 0.95,
  horizonDays = 1
): VarCvarResult {
  const z = confidence === 0.95 ? 1.645 : 2.326;
  const sqrtH = Math.sqrt(horizonDays);
  const n = returns.length;
  if (n < 5) {
    const defaultLoss = portfolioNav * 0.02 * sqrtH;
    return {
      parametricVaR: defaultLoss,
      parametricCVaR: defaultLoss * 1.25,
      historicalVaR: defaultLoss,
      historicalCVaR: defaultLoss * 1.25,
      confidence,
      horizonDays,
      portfolioNav,
    };
  }

  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const sigma = Math.sqrt(Math.max(variance, 1e-8));

  // Parametric VaR & CVaR (assuming normal distribution)
  const parametricVaR = Math.max(0, (z * sigma - mean) * portfolioNav * sqrtH);
  const phiZ = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
  const parametricCVaR = Math.max(parametricVaR, (sigma * (phiZ / (1 - confidence)) - mean) * portfolioNav * sqrtH);

  // Historical VaR & CVaR
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoffIndex = Math.max(0, Math.floor((1 - confidence) * n));
  const historicalVaR = Math.max(0, -sorted[cutoffIndex] * portfolioNav * sqrtH);
  const tailLosses = sorted.slice(0, cutoffIndex + 1);
  const avgTailLoss = tailLosses.length > 0 ? tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length : sorted[0];
  const historicalCVaR = Math.max(historicalVaR, -avgTailLoss * portfolioNav * sqrtH);

  return {
    parametricVaR,
    parametricCVaR,
    historicalVaR,
    historicalCVaR,
    confidence,
    horizonDays,
    portfolioNav,
  };
}

export function computeTailDivergence(
  parametricCVaR: number,
  historicalCVaR: number,
  threshold = 1.5
): TailDivergenceResult {
  const base = Math.max(parametricCVaR, 1e-4);
  const ratio = historicalCVaR / base;
  return { ratio, isTailDivergent: ratio > threshold, parametricCVaR, historicalCVaR };
}

export class LeverageExposureGuard {
  constructor(
    private readonly maxGrossLeverage = 3.0,
    private readonly maxSingleVenueExposureRatio = 0.50
  ) {}

  public checkExposure(
    totalNavUsd: number,
    positions: Record<string, number>
  ): LeverageCheckResult {
    const totalGross = Object.values(positions).reduce((sum, p) => sum + Math.abs(p), 0);
    const netExposure = Object.values(positions).reduce((sum, p) => sum + p, 0);
    const grossLeverage = totalNavUsd > 0 ? totalGross / totalNavUsd : 0;

    let isAllowed = grossLeverage <= this.maxGrossLeverage;
    let violationReason: string | undefined;

    if (!isAllowed) {
      violationReason = `Gross leverage ${grossLeverage.toFixed(2)}x exceeds limit ${this.maxGrossLeverage}x`;
    }

    // Check single venue concentration
    for (const [venue, exposure] of Object.entries(positions)) {
      const venueRatio = totalGross > 0 ? Math.abs(exposure) / totalGross : 0;
      if (venueRatio > this.maxSingleVenueExposureRatio) {
        isAllowed = false;
        violationReason = `Venue ${venue} concentration ${(venueRatio * 100).toFixed(1)}% exceeds cap ${(this.maxSingleVenueExposureRatio * 100).toFixed(1)}%`;
        break;
      }
    }

    return {
      grossLeverage,
      netExposure,
      isAllowed,
      maxAllowedLeverage: this.maxGrossLeverage,
      violationReason,
    };
  }
}

export class GlobalCircuitBreaker {
  private currentTier: CircuitBreakerTier = 'NORMAL';
  private peakNav: number;

  constructor(initialNav = 100000) {
    this.peakNav = initialNav;
  }

  public evaluate(currentNav: number, meanCorrelation = 0.2): CircuitBreakerState {
    if (currentNav > this.peakNav) {
      this.peakNav = currentNav;
    }
    const dd = this.peakNav > 0 ? (this.peakNav - currentNav) / this.peakNav : 0;
    let tier: CircuitBreakerTier = 'NORMAL';
    let reason = 'Normal market operation';

    if (dd >= 0.20) {
      tier = 'HARD_STOP';
      reason = `Terminal drawdown breach: ${(dd * 100).toFixed(2)}% >= 20%`;
    } else if (dd >= 0.15) {
      tier = 'HALT';
      reason = `Drawdown breach: ${(dd * 100).toFixed(2)}% >= 15%`;
    } else if (dd >= 0.10) {
      tier = 'REDUCE';
      reason = `Drawdown breach: ${(dd * 100).toFixed(2)}% >= 10%`;
    } else if (dd >= 0.05 || meanCorrelation > 0.85) {
      tier = 'ALERT';
      reason = dd >= 0.05
        ? `Drawdown breach: ${(dd * 100).toFixed(2)}% >= 5%`
        : `Correlation spike: ${meanCorrelation.toFixed(2)} > 0.85`;
    }

    this.currentTier = tier;
    return {
      tier,
      peakToTroughDrawdown: dd,
      meanCorrelation,
      grossLeverage: 1.0,
      triggeredAt: Date.now(),
      reason,
    };
  }

  public getTier(): CircuitBreakerTier {
    return this.currentTier;
  }
}

export { EngineSynchronizer } from './engine-synchronizer.fixture';
