/**
 * Accessor methods for AlphaLabAutonomousPipeline subsystems and lifecycle.
 *
 * @module alpha-lab/pipeline/alpha-lab-pipeline-accessors
 */

import type { ContinuousDiscoveryPipeline } from '../alpha-discovery/continuous-discovery-pipeline';
import type { AISignalAdapter } from '../../desk/strategies/ai-signal-adapter';
import type { AISignalPaperRouter } from '../../desk/strategies/ai-signal-paper-router';
import type { AlphaLifecycleStateMachine } from '../attribution/alpha-lifecycle-state-machine';
import type { LiveGuardHandoffCoordinator } from '../../desk/execution/live-guard-handoff';
import type { RegimeAwareKelly } from '../../desk/risk/regime-aware-kelly';
import type { CircuitBreaker } from '../../desk/risk/circuit-breaker';
import type { PipelineCoreContext } from './alpha-lab-pipeline-context';

export function getLifecycleStateMachine(
  ctx: PipelineCoreContext,
  strategyId: string,
): AlphaLifecycleStateMachine | undefined {
  return ctx.state.stateMachines.get(strategyId);
}

export function getPaperRouter(ctx: PipelineCoreContext): AISignalPaperRouter {
  return ctx.subsystems.paperRouter;
}

export function getSignalAdapter(ctx: PipelineCoreContext): AISignalAdapter {
  return ctx.subsystems.signalAdapter;
}

export function getLiveCoordinator(ctx: PipelineCoreContext): LiveGuardHandoffCoordinator {
  return ctx.subsystems.liveCoordinator;
}

export function getDiscoveryPipeline(ctx: PipelineCoreContext): ContinuousDiscoveryPipeline {
  return ctx.subsystems.discoveryPipeline;
}

export function getRegimeKelly(ctx: PipelineCoreContext): RegimeAwareKelly {
  return ctx.subsystems.regimeKelly;
}

export function getCircuitBreaker(ctx: PipelineCoreContext): CircuitBreaker {
  return ctx.subsystems.circuitBreaker;
}

export function getTrackedStrategyIds(ctx: PipelineCoreContext): string[] {
  return Array.from(ctx.state.stateMachines.keys());
}
