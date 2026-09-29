import {
  ENGINE_IDS,
  EngineId,
  PortfolioAllocation,
  AllocationConfig,
  AllocationConfigSchema,
  AllocationContext,
  AllocationContextSchema,
  CovarianceMatrix,
} from './types';
import { RollingCovarianceEstimator } from './rolling-covariance';
import { ErcParitySolver } from './erc-parity-solver';
import { PerformanceTiltEngine } from './performance-tilt';
import { CapitalBufferGuard } from './capital-buffer-guard';
import { logger } from '../../shared/utils/logger';

export class PortfolioAllocator {
  private config: AllocationConfig;
  private readonly covarianceEstimator: RollingCovarianceEstimator;
  private readonly ercSolver: ErcParitySolver;
  private readonly tiltEngine: PerformanceTiltEngine;
  private readonly bufferGuard: CapitalBufferGuard;

  constructor(customConfig: Partial<AllocationConfig> = {}) {
    this.config = AllocationConfigSchema.parse(customConfig);
    this.covarianceEstimator = new RollingCovarianceEstimator({
      coldStartWindow: this.config.coldStartWindow,
      ridgeEpsilon: this.config.ridgeEpsilon,
    });
    this.ercSolver = new ErcParitySolver({
      tolerance: this.config.convergenceTolerance,
      maxIterations: this.config.maxIterations,
    });
    this.tiltEngine = new PerformanceTiltEngine({
      gammaTilt: this.config.gammaTilt,
      minRiskBudget: this.config.minRiskBudget,
      maxRiskBudget: this.config.maxRiskBudget,
      riskFreeRate: this.config.riskFreeRate,
    });
    this.bufferGuard = new CapitalBufferGuard({
      minCashBufferRatio: this.config.minCashBufferRatio,
      rebalanceDeadband: this.config.rebalanceDeadband,
      cooldownPeriodMs: this.config.cooldownPeriodMs,
    });
  }

  public updateReturns(
    returns: Record<EngineId, number>,
    timestamp = Date.now()
  ): CovarianceMatrix {
    return this.covarianceEstimator.addObservation(returns, timestamp);
  }

  public getCovarianceMatrix(): CovarianceMatrix {
    return this.covarianceEstimator.getCovarianceMatrix();
  }

  public getConfig(): Readonly<AllocationConfig> {
    return this.config;
  }

  public updateConfig(partial: Partial<AllocationConfig>): void {
    this.config = AllocationConfigSchema.parse({ ...this.config, ...partial });
    this.covarianceEstimator.setRidgeEpsilon(this.config.ridgeEpsilon);
    this.bufferGuard.setMinCashBufferRatio(this.config.minCashBufferRatio);
  }

  public allocate(rawContext: AllocationContext): PortfolioAllocation {
    const context = AllocationContextSchema.parse(rawContext);
    const timestamp = context.timestamp ?? Date.now();

    logger.debug('Starting portfolio allocation cycle', {
      nav: context.totalNavUsd,
      regime: context.regime,
    });

    // 1. Compute tilted risk budgets from rolling performance & regime alignment
    const tiltedBudgets = this.tiltEngine.computeTiltedBudgets(
      context.performance,
      context.regime
    );

    // 2. Solve Equal Risk Contribution weights via Spinu CCD
    const covMatrix = this.covarianceEstimator.getCovarianceMatrix();
    const ercResult = this.ercSolver.solve(covMatrix, tiltedBudgets, {
      tolerance: this.config.convergenceTolerance,
      maxIterations: this.config.maxIterations,
    });

    // 3. Apply 20% liquid cash buffer guard and starvation locks
    const guardResult = this.bufferGuard.applyGuard(
      context.totalNavUsd,
      ercResult.weights,
      context.lockedCapital
    );

    // 4. Record rebalancing event timestamp
    this.bufferGuard.recordRebalance(timestamp);

    // 5. Construct NAV weights (strategy dollar allocation / total NAV)
    const weights: Partial<Record<EngineId, number>> = {};
    for (const id of ENGINE_IDS) {
      weights[id] =
        context.totalNavUsd > 0
          ? (guardResult.allocatedCapitalUsd[id] ?? 0) / context.totalNavUsd
          : 0;
    }

    const allocation: PortfolioAllocation = {
      weights: weights as Record<EngineId, number>,
      allocatedCapitalUsd: guardResult.allocatedCapitalUsd,
      unallocatedCashUsd: guardResult.unallocatedCashUsd,
      cashBufferRatio: guardResult.cashBufferRatio,
      riskContributions: ercResult.riskContributions,
      maxRiskDiscrepancy: ercResult.maxDiscrepancy,
      timestamp,
    };

    logger.info('Portfolio allocation completed', {
      unallocatedCashUsd: allocation.unallocatedCashUsd,
      cashBufferRatio: allocation.cashBufferRatio,
      maxDiscrepancy: allocation.maxRiskDiscrepancy,
      ercConverged: ercResult.converged,
      drainModeEngines: guardResult.drainModeEngines,
    });

    return allocation;
  }

  public reset(): void {
    this.covarianceEstimator.reset();
  }
}
