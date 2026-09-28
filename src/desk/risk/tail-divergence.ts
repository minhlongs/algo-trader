import { logger } from '../../shared/utils/logger';
import type { TailDivergenceResult } from './portfolio-risk-types';

export function computeTailDivergence(
  parametricCVaR: number,
  historicalCVaR: number,
  threshold = 1.5
): TailDivergenceResult {
  const safeParametric = Number.isFinite(parametricCVaR) ? Math.max(0, parametricCVaR) : 0;
  const safeHistorical = Number.isFinite(historicalCVaR) ? Math.max(0, historicalCVaR) : 0;

  const base = Math.max(safeParametric, 1e-4);
  const ratio = safeHistorical / base;
  const isTailDivergent = ratio > threshold;

  const warningMessage = isTailDivergent
    ? `Tail risk divergence detected: Historical CVaR (${safeHistorical.toFixed(2)}) is ${ratio.toFixed(2)}x parametric CVaR (${safeParametric.toFixed(2)}), exceeding threshold ${threshold.toFixed(2)}`
    : undefined;

  if (isTailDivergent) {
    logger.warn(`[TailDivergence] ${warningMessage}`);
  }

  return {
    ratio,
    isTailDivergent,
    parametricCVaR: safeParametric,
    historicalCVaR: safeHistorical,
    threshold,
    warningMessage,
  };
}

export class TailDivergenceDetector {
  private lastResult: TailDivergenceResult | null = null;

  constructor(private readonly defaultThreshold = 1.5) {}

  public evaluate(
    parametricCVaR: number,
    historicalCVaR: number,
    threshold?: number
  ): TailDivergenceResult {
    const result = computeTailDivergence(
      parametricCVaR,
      historicalCVaR,
      threshold ?? this.defaultThreshold
    );
    this.lastResult = result;
    return result;
  }

  public isAlertActive(): boolean {
    return this.lastResult?.isTailDivergent ?? false;
  }

  public getLastResult(): TailDivergenceResult | null {
    return this.lastResult;
  }

  public getRecommendedCashBufferMultiplier(): number {
    return this.isAlertActive() ? 1.25 : 1.0;
  }

  public getRecommendedLeverageReduction(): number {
    return this.isAlertActive() ? 0.75 : 1.0;
  }
}
