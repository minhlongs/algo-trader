/**
 * Prediction Market Automated Market Maker (AMM / CPMM / LMSR) Engine
 * Public Barrel Exports
 */

// Types
export * from './types/amm-types';
export * from './types/arbitrage-types';
export * from './types/cpmm-types';
export * from './types/liquidity-types';
export * from './types/lmsr-types';
export * from './types/risk-types';
export * from './types/telemetry-types';

// Pricing Engines (M1)
export { LmsrPricing } from './pricing/lmsr-pricing';
export { CpmmPricing } from './pricing/cpmm-pricing';
export { DynamicBAdapter } from './pricing/dynamic-b-adapter';

// Pool & Routing (M1)
export { VirtualReserveTracker } from './pool/virtual-reserve-tracker';
export { MultiTokenPool, type MultiTokenPoolConfig } from './pool/multi-token-pool';
export { HybridOrderRouter } from './pool/hybrid-order-router';

// Arbitrage & Execution (M2)
export { CombinatorialScanner, type MarketQuotesInput, type QuoteSource } from './arbitrage/combinatorial-scanner';
export { BasketPricer, type BasketPricingConfig, type BasketValuation } from './arbitrage/basket-pricer';
export { AtomicBasketCoordinator, type CoordinatorConfig, type LegExecutionFn } from './arbitrage/atomic-basket-coordinator';
export { CompensatoryUnwindHandler, type UnwindOptions, type UnwindOrderExecutor } from './arbitrage/compensatory-unwind-handler';

// Liquidity Provision & Cross-Market Rebalancing (M3)
export { TwoSidedQuoter, type QuoterInventory } from './liquidity/two-sided-quoter';
export { InventoryDeltaRebalancer, type RebalanceConfig } from './liquidity/inventory-delta-rebalancer';
export { AdverseSelectionGuard } from './liquidity/adverse-selection-guard';

// Pre-Trade Risk Gates & Breakers (M4)
export { AmmRiskGuard } from './risk/amm-risk-guard';
export { KellyPositionSizer } from './risk/kelly-position-sizer';
export { DrawdownBreaker } from './risk/drawdown-breaker';

// Telemetry & Cryptographic Audit (M4)
export { AmmMetricsRecorder } from './telemetry/amm-metrics';
export { AmmAuditLogger } from './telemetry/amm-audit-logger';

// Master AMM Engine Facade (M4)
export { AmmEngine, MasterAmmEngine } from './engine/amm-engine';
