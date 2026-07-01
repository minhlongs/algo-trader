// Barrel export for Polymarket strategies — V2 base class pattern
//
// Each strategy now lives in a *-v2.ts file extending BasePolymarketStrategy.
// Legacy createXxxTick() factories are re-exported via toTickFn() for backward compat.
// Two pre-migration modules remain at their original paths:
//   inventory-skew-rebalancer, whale-tracker
//
// Helper/utility modules (not strategies):
//   multi-leg-hedge, price-impact-estimator, strategy-math-helpers,
//   strategy-position-manager, strategy-shared-types, herd-behavior-math-helpers,
//   delta-calculator, delta-neutral-portfolio-monitor

// ── V2 Strategy modules ─────────────────────────────────────────────────────

export { createBollingerSqueezeTick } from './bollinger-squeeze-v2';
export type { BollingerSqueezeConfig, BollingerSqueezeDeps } from './bollinger-squeeze-v2';

export { createClusterBreakoutTick } from './cluster-breakout-v2';
export type { ClusterBreakoutConfig, ClusterBreakoutDeps } from './cluster-breakout-v2';

export { createCrossCorrelationLagTick } from './cross-correlation-lag-v2';
export type { CrossCorrelationLagConfig, CrossCorrelationLagDeps } from './cross-correlation-lag-v2';

export { createCrossEventDriftTick } from './cross-event-drift-v2';
export type { CrossEventDriftConfig, CrossEventDriftDeps } from './cross-event-drift-v2';

export { createDecayRateMomentumTick } from './decay-rate-momentum-v2';
export type { DecayRateMomentumConfig, DecayRateMomentumDeps } from './decay-rate-momentum-v2';

export { createEventDeadlineScalperTick } from './event-deadline-scalper-v2';
export type { EventDeadlineScalperConfig, EventDeadlineScalperDeps } from './event-deadline-scalper-v2';

export { createGapFillReversionTick } from './gap-fill-reversion-v2';
export type { GapFillReversionConfig, GapFillReversionDeps } from './gap-fill-reversion-v2';

export { createHerdBehaviorDetectorTick } from './herd-behavior-detector-v2';
export type { HerdBehaviorDetectorConfig, HerdBehaviorDetectorDeps } from './herd-behavior-detector-v2';

export { createInfoAsymmetryScannerTick } from './info-asymmetry-scanner-v2';
export type { InfoAsymmetryScannerConfig, InfoAsymmetryScannerDeps } from './info-asymmetry-scanner-v2';

export { createLiquidityMigrationTick } from './liquidity-migration-v2';
export type { LiquidityMigrationConfig, LiquidityMigrationDeps } from './liquidity-migration-v2';

export { createListingArbitrageSniperTick } from './listing-arbitrage-sniper';
export type { ListingArbConfig, ListingArbDeps } from './listing-arbitrage-sniper';

export { createMarkovChainPredictorTick } from './markov-chain-predictor-v2';
export type { MarkovChainPredictorConfig, MarkovChainPredictorDeps } from './markov-chain-predictor-v2';

export { createMeanVarianceOptimizerTick } from './mean-variance-optimizer-v2';
export type { MeanVarianceOptimizerConfig, MeanVarianceOptimizerDeps } from './mean-variance-optimizer-v2';

export { createMomentumCascadeTick } from './momentum-cascade-v2';
export type { MomentumCascadeConfig, MomentumCascadeDeps } from './momentum-cascade-v2';

export { createOrderArrivalRateTick } from './order-arrival-rate-v2';
export type { OrderArrivalRateConfig, OrderArrivalRateDeps } from './order-arrival-rate-v2';

export { createOrderbookDepthRatioTick } from './orderbook-depth-ratio-v2';
export type { OrderbookDepthConfig, OrderbookDepthDeps } from './orderbook-depth-ratio-v2';

export { createPivotPointBounceTick } from './pivot-point-bounce-v2';
export type { PivotPointBounceConfig, PivotPointBounceDeps } from './pivot-point-bounce-v2';

export { createPriceAccelerationTick } from './price-acceleration-v2';
export type { PriceAccelerationConfig, PriceAccelerationDeps } from './price-acceleration-v2';

export { createRecencyBiasExploiterTick } from './recency-bias-exploiter-v2';
export type { RecencyBiasExploiterConfig, RecencyBiasExploiterDeps } from './recency-bias-exploiter-v2';

export { createRegimeAdaptiveMomentumTick } from './regime-adaptive-momentum-v2';
export type { RegimeAdaptiveMomentumConfig, RegimeAdaptiveMomentumDeps } from './regime-adaptive-momentum-v2';

export { createRegimeSwitchDetectorTick } from './regime-switch-detector-v2';
export type { RegimeSwitchDetectorConfig, RegimeSwitchDetectorDeps } from './regime-switch-detector-v2';

export { createRelativeStrengthRotationTick } from './relative-strength-rotation-v2';
export type { RelativeStrengthRotationConfig, RelativeStrengthRotationDeps } from './relative-strength-rotation-v2';

export { createResolutionFrontrunnerTick } from './resolution-frontrunner-v2';
export type { ResolutionFrontrunnerConfig, ResolutionFrontrunnerDeps } from './resolution-frontrunner-v2';

export { createSpreadMeanReversionTick } from './spread-mean-reversion-v2';
export type { SpreadMeanReversionConfig, SpreadMeanReversionDeps } from './spread-mean-reversion-v2';

export { createStaleQuoteSniperTick } from './stale-quote-sniper-v2';
export type { StaleQuoteSniperConfig, StaleQuoteSniperDeps } from './stale-quote-sniper-v2';

export { createTailRiskHarvesterTick } from './tail-risk-harvester-v2';
export type { TailRiskHarvesterConfig, TailRiskHarvesterDeps } from './tail-risk-harvester-v2';

export { createTimeWeightedMeanReversionTick } from './time-weighted-mean-reversion-v2';
export type { TimeWeightedMeanReversionConfig, TimeWeightedMeanReversionDeps } from './time-weighted-mean-reversion-v2';

export { createVolCompressionBreakoutTick } from './vol-compression-breakout-v2';
export type { VolCompressionConfig, VolCompressionDeps } from './vol-compression-breakout-v2';

export { createVolatilityTargetingTick } from './volatility-targeting-v2';
export type { VolatilityTargetingConfig, VolatilityTargetingDeps } from './volatility-targeting-v2';

export { createVwapDeviationSniperTick } from './vwap-deviation-sniper-v2';
export type { VwapDeviationSniperConfig, VwapDeviationSniperDeps } from './vwap-deviation-sniper-v2';

export { createWeightedSentimentAggregatorTick } from './weighted-sentiment-aggregator-v2';
export type { WeightedSentimentAggregatorConfig, WeightedSentimentAggregatorDeps } from './weighted-sentiment-aggregator-v2';

export { createWhaleTrackerTick } from './whale-tracker-v2';
export type { WhaleTrackerConfig, WhaleTrackerDeps } from './whale-tracker-v2';

// ── Pre-migration module (different archetype — portfolio meta-strategy) ─────

export { createInventorySkewRebalancerTick } from './inventory-skew-rebalancer';
export type { InventorySkewRebalancerConfig, InventorySkewRebalancerDeps } from './inventory-skew-rebalancer';

// ── Non-strategy helpers ─────────────────────────────────────────────────────

export { createMultiLegHedgeTick } from './multi-leg-hedge';
export type { MultiLegHedgeConfig, MultiLegHedgeDeps } from './multi-leg-hedge';

export { createPriceImpactEstimatorTick } from './price-impact-estimator';
export type { PriceImpactEstimatorConfig, PriceImpactEstimatorDeps } from './price-impact-estimator';

// ── Base class ───────────────────────────────────────────────────────────────

export {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type OpenPosition,
  type StrategyDeps,
  type TradeEvent,
} from './base-polymarket-strategy';
