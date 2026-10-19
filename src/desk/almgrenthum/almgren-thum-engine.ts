/**
 * Wave 214: Almgren, Thum, Hauptmann & Li (2005) Non-Linear Impact Engine.
 *
 * Evaluates concave square-root market impact and execution shortfall.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import {
  AlmgrenThumConfig,
  AlmgrenThumOrder,
  AlmgrenThumResult,
} from './almgren-thum-types';
import { AlmgrenThumMath } from './almgren-thum-math';

export class AlmgrenThumEngine {
  private readonly config: AlmgrenThumConfig;

  constructor(config: AlmgrenThumConfig) {
    if (config.dailyVolatility <= 0) {
      throw new Error('Daily volatility must be positive');
    }
    if (config.averageDailyVolume <= 0) {
      throw new Error('Average daily volume must be positive');
    }
    this.config = config;
  }

  public evaluateExecution(order: AlmgrenThumOrder): AlmgrenThumResult {
    if (order.totalShares <= 0) {
      throw new Error('Order total shares must be strictly positive');
    }
    if (order.executionHorizonDays <= 0) {
      throw new Error('Execution horizon days must be strictly positive');
    }

    const sim = AlmgrenThumMath.simulateOptimalTrajectory(order, this.config);
    const avgSpeed = order.totalShares / order.executionHorizonDays;
    const isConcave = AlmgrenThumMath.verifySquareRootScaling(
      this.config.averageDailyVolume,
      this.config.dailyVolatility,
      this.config.tempImpactCoeff
    );

    let status: 'OPTIMAL_EXECUTION' | 'POV_CONSTRAINED' | 'EXCESSIVE_SLIPPAGE' = 'OPTIMAL_EXECUTION';
    if (order.participationRateCap && sim.maxPovPct >= order.participationRateCap * 100.0 - 1e-5) {
      status = 'POV_CONSTRAINED';
    } else if (sim.totalShortfallBps > 150.0) {
      status = 'EXCESSIVE_SLIPPAGE';
    }

    return {
      totalShares: order.totalShares,
      horizonDays: order.executionHorizonDays,
      expectedTemporaryImpactBps: sim.expectedTempBps,
      expectedPermanentImpactBps: sim.expectedPermBps,
      totalImplementationShortfallBps: sim.totalShortfallBps,
      averageTradeSpeedSharesPerDay: Number(avgSpeed.toFixed(2)),
      maxParticipationRatePct: sim.maxPovPct,
      isConcaveImpactObserved: isConcave,
      status,
      trajectory: sim.trajectory,
    };
  }

  public getConfig(): Readonly<AlmgrenThumConfig> {
    return { ...this.config };
  }
}
