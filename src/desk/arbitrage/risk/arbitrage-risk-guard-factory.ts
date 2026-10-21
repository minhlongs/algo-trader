/**
 * Arbitrage Risk Guard Factory
 *
 * Default construction of a risk guard's collaborator graph (live execution
 * guard → risk gate manager → kelly sizer). Extracted so the guard class keeps
 * only check/expose methods and the fallback wiring is testable on its own.
 */

import { KellyPositionSizer } from '../../risk/kelly-position-sizer';
import { RiskGateManager } from '../../risk/risk-gate-manager';
import type { TieredDrawdownBreaker } from '../../risk/tiered-drawdown-breaker';
import type { DrawdownMonitor } from '../../risk/drawdown-monitor';
import type { CircuitBreaker } from '../../risk/circuit-breaker';
import type { SpreadDetector } from '../spread-detector';
import { LiveExecutionGuard } from '../../execution/live-execution-guard-core';
import type { ArbitrageRiskConfig } from './arbitrage-risk-types';

/** Optional collaborator overrides for an arbitrage risk guard. */
export interface ArbitrageRiskGuardDependencies {
  riskGateManager?: RiskGateManager;
  liveExecutionGuard?: LiveExecutionGuard;
  kellyPositionSizer?: KellyPositionSizer;
  tieredDrawdownBreaker?: TieredDrawdownBreaker;
  drawdownMonitor?: DrawdownMonitor;
  circuitBreaker?: CircuitBreaker;
  spreadDetector?: SpreadDetector;
}

/** Collaborators a guard needs, with defaults filled in for every option omitted. */
export interface RiskGuardCollaborators {
  liveExecutionGuard: LiveExecutionGuard;
  riskGateManager: RiskGateManager;
  kellyPositionSizer: KellyPositionSizer;
}

/**
 * Build the guard's collaborators from effective config plus any caller-supplied
 * overrides. The risk gate manager always shares the resolved execution guard so
 * both see the same live-mode state.
 */
export function buildRiskGuardCollaborators(
  config: ArbitrageRiskConfig,
  deps: ArbitrageRiskGuardDependencies,
  circuitBreaker?: CircuitBreaker,
): RiskGuardCollaborators {
  const liveExecutionGuard =
    deps.liveExecutionGuard ??
    new LiveExecutionGuard({
      capitalUsdc: config.capitalUsdc,
      maxDailyDrawdown: config.maxDailyDrawdownFraction,
      maxPositionFraction: config.maxKellyPositionFraction,
      enabled: true,
    });

  const riskGateManager =
    deps.riskGateManager ?? new RiskGateManager(liveExecutionGuard, circuitBreaker);

  const kellyPositionSizer =
    deps.kellyPositionSizer ??
    new KellyPositionSizer({
      kellyFraction: config.kellyFraction,
      maxPositionFraction: config.maxKellyPositionFraction,
      minPositionUsd: 10,
    });

  return { liveExecutionGuard, riskGateManager, kellyPositionSizer };
}
