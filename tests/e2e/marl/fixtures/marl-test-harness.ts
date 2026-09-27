/**
 * MARL Test Harness & Loader.
 * Bridges production modules from src/desk/marl (where implemented)
 * with reference components to provide a complete, verified execution suite.
 */

// Import production M1 modules
export {
  calculateReservationPrice as prodCalculateReservationPrice,
  calculateOptimalSpreadBase as prodCalculateOptimalSpreadBase,
  quantizeToTick as prodQuantizeToTick,
  calculateOptimalQuotes as prodCalculateOptimalQuotes,
  AvellanedaStoikovModel as ProdAvellanedaStoikovModel,
} from '../../../../src/desk/marl/models/avellaneda-stoikov';

export {
  calculateArrivalIntensity as prodCalculateArrivalIntensity,
  calculateFillProbability as prodCalculateFillProbability,
  calculateExpectedFillTime as prodCalculateExpectedFillTime,
  simulateFillEvent as prodSimulateFillEvent,
} from '../../../../src/desk/marl/models/arrival-intensity';

export {
  MultiAgentCoordinator as ProdMultiAgentCoordinator,
} from '../../../../src/desk/marl/agents/multi-agent-coordinator';

export {
  AdaptiveQuotingAgent as ProdAdaptiveQuotingAgent,
} from '../../../../src/desk/marl/agents/adaptive-quoting-agent';

export {
  InventorySkewAgent as ProdInventorySkewAgent,
} from '../../../../src/desk/marl/agents/inventory-skew-agent';

export {
  MarketReplayEngine as ProdMarketReplayEngine,
} from '../../../../src/desk/marl/environment/market-replay-engine';

export {
  LiveStreamAdapter as ProdLiveStreamAdapter,
} from '../../../../src/desk/marl/environment/live-stream-adapter';

// Re-export contracts & reference components
export * from './marl-contracts';
export * from './marl-reference-components';
