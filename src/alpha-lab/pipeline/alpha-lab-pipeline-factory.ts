/**
 * Alpha-Lab Autonomous Pipeline Subsystems Factory
 */

import { ContinuousDiscoveryPipeline } from '../alpha-discovery/continuous-discovery-pipeline';
import { AISignalAdapter } from '../../desk/strategies/ai-signal-adapter';
import { AISignalPaperRouter } from '../../desk/strategies/ai-signal-paper-router';
import { PaperExecutor } from '../../desk/execution/paper-executor';
import { RegimeAwareKelly } from '../../desk/risk/regime-aware-kelly';
import { LiveGuardHandoffCoordinator } from '../../desk/execution/live-guard-handoff';
import { LiveExecutionGuard } from '../../desk/execution/live-execution-guard-core';
import type { AlphaLabAutonomousPipelineConfig } from './alpha-lab-pipeline-types';

export interface PipelineSubsystems {
  discoveryPipeline: ContinuousDiscoveryPipeline;
  signalAdapter: AISignalAdapter;
  paperExecutor: PaperExecutor;
  regimeKelly: RegimeAwareKelly;
  paperRouter: AISignalPaperRouter;
  liveGuard: LiveExecutionGuard;
  liveCoordinator: LiveGuardHandoffCoordinator;
}

export function createPipelineSubsystems(
  symbol: string,
  timeframe: string,
  initialBalanceUsd: number,
  liveCapitalUsdc: number,
  config?: AlphaLabAutonomousPipelineConfig,
): PipelineSubsystems {
  const discoveryPipeline =
    config?.discoveryPipeline ??
    new ContinuousDiscoveryPipeline({
      symbol,
      timeframe,
      ...config?.discoveryConfig,
    });

  const signalAdapter =
    config?.signalAdapter ??
    new AISignalAdapter(
      config?.adapterConfig ?? {
        confidenceThreshold: 0.7,
        minExpectancy: 0.01,
      },
    );

  const paperExecutor =
    config?.paperExecutor ??
    new PaperExecutor({ initialBalance: initialBalanceUsd });

  const regimeKelly =
    config?.regimeKelly ??
    new RegimeAwareKelly({
      kelly: {
        kellyFraction: 0.25,
        maxPositionFraction: 0.05,
        minPositionUsd: 1.0,
        isManagedCapital: true,
      },
      regimeMultipliers: {
        TREND_UP: 1.25,
        TREND_DOWN: 0.50,
        RANGE: 1.00,
        HIGH_VOLATILITY: 0.50,
        LOW_VOLATILITY: 1.10,
        SHOCK: 0.00,
        UNKNOWN: 0.75,
      },
      unknownRegimeMultiplier: 0.75,
    });

  const paperRouter =
    config?.paperRouter ??
    new AISignalPaperRouter({
      adapter: signalAdapter,
      paperExecutor,
      regimeKelly,
      drawdownBreaker: config?.drawdownBreaker,
      defaultSymbol: symbol,
    });

  const liveGuard =
    config?.liveGuard ??
    new LiveExecutionGuard({ capitalUsdc: liveCapitalUsdc, enabled: true });

  const liveCoordinator =
    config?.liveCoordinator ??
    new LiveGuardHandoffCoordinator({
      guard: liveGuard,
      capitalUsdc: liveCapitalUsdc,
      drawdownBreaker: config?.drawdownBreaker,
    });

  return {
    discoveryPipeline,
    signalAdapter,
    paperExecutor,
    regimeKelly,
    paperRouter,
    liveGuard,
    liveCoordinator,
  };
}
