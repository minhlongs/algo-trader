/**
 * Live Trading Orchestrator — Public Barrel Re-exports
 *
 * Centralizes all public symbols from the modularized orchestrator.
 * Import from 'live-trading-orchestrator' (which re-exports from here)
 * for backward compatibility.
 */

export type { OrchestratorStatus, LiveTradingConfig } from './live-trading-types';
export { validateLiveEnv } from './live-trading-types';

export {
  LiveTradingStrategyExecutor,
  type StrategyTickFn,
  type TickContext,
} from './live-trading-strategy-executor';

export {
  LiveTradingEventHandler,
  type PositionInfo,
  type PriceEvent,
  type PriceEventBus,
} from './live-trading-event-handler';

export {
  LiveTradingPersistence,
  type OrchestratorStateSnapshot,
  type JournalEntry,
} from './live-trading-persistence';

export {
  buildCoreComponents,
  buildStartComponents,
  buildOrchestratorComponents,
  buildAdapter,
  normalizeConfig,
  type OrchestratorComponents,
  type AdapterComponents,
} from './live-trading-adapter-setup';

export {
  persistOrchestratorState,
  restoreOrchestratorState,
} from './live-trading-state-persistence';
