/**
 * AI Signal Paper Router (Facade)
 *
 * Coordinates ingestion of ML/alpha-lab AISignal instances, validates
 * them through AISignalAdapter, sizes positions via RegimeAwareKelly / sizeSignalToTradeSignal,
 * executes simulated orders in PaperExecutor, produces PaperTradeFillRecord
 * provenance objects, and maintains real-time equity curves.
 */

export {
  type EquityPoint,
  type RoutingStatus,
  type SignalRoutingOutcome,
  type AISignalPaperRouterConfig,
} from './ai-signal-paper-router-types';

export { PaperEquityTracker } from './ai-signal-paper-router-tracker';
export { AISignalPaperRouter } from './ai-signal-paper-router-class';
