/**
 * Arbitrage Engine Types
 * Phase 2: Multi-exchange arbitrage trading
 */

export type {
  ExchangeId,
  PricePoint,
  OrderBookLevel,
  OrderBook,
  ArbitrageOpportunity,
  ArbitrageLeg,
  ExecutionResult,
  ExecutedLeg,
  BacktestConfig,
  BacktestResult,
  OpportunityMetric,
  ScannerConfig,
  DetectorConfig,
  ExecutorConfig,
  ExecutionEngineConfig,
} from './types-opportunity';

export { ExecutionEngine } from './types-opportunity';

export type {
  StrategyExecutor,
  StrategyMetrics,
  UnifiedExecutorConfig,
  BinaryMarket,
  BinaryArbitrageOpportunity,
  SplitMergeArbitrageOpportunity,
  CrossMarketArbitrageOpportunity,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
} from './types-strategy';
