/**
 * Alpha-Lab Autonomous Pipeline Types
 */

import type { ContinuousDiscoveryPipeline, ContinuousDiscoveryPipelineConfig, ContinuousDiscoveryResult } from '../alpha-discovery/continuous-discovery-pipeline';
import type { AISignal, AISignalConfig, AISignalAdapter } from '../../desk/strategies/ai-signal-adapter';
import type { AISignalPaperRouter, SignalRoutingOutcome } from '../../desk/strategies/ai-signal-paper-router';
import type { PaperExecutor } from '../../desk/execution/paper-executor';
import type { RegimeAwareKelly } from '../../desk/risk/regime-aware-kelly';
import type { TieredDrawdownBreaker } from '../../desk/risk/tiered-drawdown-breaker';
import type { AlphaLifecycleState, PromotionStateTransition } from '../attribution/alpha-lifecycle-state-machine';
import type { LiveGuardHandoffCoordinator, LiveHandoffStatus } from '../../desk/execution/live-guard-handoff';
import type { LiveExecutionGuard } from '../../desk/execution/live-execution-guard-core';
import type { LedgerRecord } from '../provenance/research-ledger';
import type { RunCard } from '../provenance/run-card';
import type { CandleLike, MarketRegime } from '../regimes/regime-types';
import type { GateEvaluatorInput } from '../gates/gate-evaluator-types';
import type { PnlSummary, PaperPosition } from '../../desk/execution/paper-position-types';

/**
 * Configuration options for AlphaLabAutonomousPipeline.
 */
export interface AlphaLabAutonomousPipelineConfig {
  /** Target market symbol for candidate discovery and trading (default: 'BTC/USDT'). */
  symbol?: string;
  /** Candle timeframe (default: '1h'). */
  timeframe?: string;
  /** Initial balance in USD for paper trading execution (default: 100,000). */
  initialBalanceUsd?: number;
  /** Total capital in USDC for live execution guard (default: 100,000). */
  liveCapitalUsdc?: number;
  /** Pre-configured or custom ContinuousDiscoveryPipeline. */
  discoveryPipeline?: ContinuousDiscoveryPipeline;
  /** Configuration options if instantiating discovery pipeline internally. */
  discoveryConfig?: Partial<ContinuousDiscoveryPipelineConfig>;
  /** Pre-configured or custom AISignalAdapter. */
  signalAdapter?: AISignalAdapter;
  /** Configuration options for AISignalAdapter if instantiating internally. */
  adapterConfig?: AISignalConfig;
  /** Pre-configured or custom AISignalPaperRouter. */
  paperRouter?: AISignalPaperRouter;
  /** Pre-configured or custom PaperExecutor. */
  paperExecutor?: PaperExecutor;
  /** Pre-configured or custom RegimeAwareKelly sizer. */
  regimeKelly?: RegimeAwareKelly;
  /** Pre-configured or custom TieredDrawdownBreaker. */
  drawdownBreaker?: TieredDrawdownBreaker;
  /** Pre-configured or custom LiveGuardHandoffCoordinator. */
  liveCoordinator?: LiveGuardHandoffCoordinator;
  /** Pre-configured or custom LiveExecutionGuard. */
  liveGuard?: LiveExecutionGuard;
  /** Path to research ledger JSONL file (default: DEFAULT_LEDGER_PATH). */
  ledgerPath?: string;
  /** Directory path to store JSON/MD run cards (default: 'data/run-cards'). */
  runCardDir?: string;
  /** Whether to verify hash-chain integrity before appending ledger records (default: true). */
  strictLedgerVerification?: boolean;
}

/**
 * Options for a single autonomous cycle execution.
 */
export interface AutonomousCycleOptions {
  /** Optional pre-loaded candle data for discovery and regime evaluation. */
  candles?: CandleLike[];
  /** Latest market price for order routing and mark-to-market valuation. */
  currentPrice?: number;
  /** Explicit market regime override (if not derived from candles). */
  regime?: MarketRegime;
  /** Trade direction for candidate signal generation (default: 'BUY'). */
  signalDirection?: 'BUY' | 'SELL';
  /** External gate evaluation inputs per strategy for promotion gate evaluation. */
  gateInputs?: Map<string, GateEvaluatorInput>;
}

/**
 * Complete structured summary result of an autonomous cycle execution.
 */
export interface AutonomousCycleResult {
  cycleId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  discoveryResult: ContinuousDiscoveryResult;
  signals: AISignal[];
  routingOutcomes: SignalRoutingOutcome[];
  promotionTransitions: PromotionStateTransition[];
  runCards: RunCard[];
  ledgerRecords: LedgerRecord[];
  status: AlphaLabPipelineStatus;
}

/**
 * Real-time operational status snapshot of the entire autonomous pipeline.
 */
export interface AlphaLabPipelineStatus {
  cycleCount: number;
  lastCycleAt: string | null;
  isRunning: boolean;
  lifecycleStates: Record<string, AlphaLifecycleState>;
  totalStrategiesCount: number;
  stateDistribution: Record<AlphaLifecycleState, number>;
  paperPnl: PnlSummary;
  openPositions: PaperPosition[];
  equity: number;
  highWaterMark: number;
  maxHistoricalDrawdown: number;
  liveHandoffStatus: LiveHandoffStatus;
  isLedgerChainValid: boolean;
}
