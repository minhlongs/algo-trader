// Barrel export for Polymarket strategies — only existing strategy modules

export { createOrderbookDepthRatioTick } from '@desk/strategies/polymarket/orderbook-depth-ratio-v2';
export type { OrderbookDepthConfig, OrderbookDepthDeps } from '@desk/strategies/polymarket/orderbook-depth-ratio-v2';

export { createCrossEventDriftTick } from '@desk/strategies/polymarket/cross-event-drift-v2';
export type { CrossEventDriftConfig, CrossEventDriftDeps } from '@desk/strategies/polymarket/cross-event-drift-v2';

export { createVolCompressionBreakoutTick } from '@desk/strategies/polymarket/vol-compression-breakout-v2';
export type { VolCompressionConfig, VolCompressionDeps } from '@desk/strategies/polymarket/vol-compression-breakout-v2';

export { createWhaleTrackerTick } from '@desk/strategies/polymarket/whale-tracker-v2';
export type { WhaleTrackerConfig, WhaleTrackerDeps } from '@desk/strategies/polymarket/whale-tracker-v2';

export { createResolutionFrontrunnerTick } from '@desk/strategies/polymarket/resolution-frontrunner-v2';
export type { ResolutionFrontrunnerConfig, ResolutionFrontrunnerDeps } from '@desk/strategies/polymarket/resolution-frontrunner-v2';

export { createMultiLegHedgeTick } from '@desk/strategies/polymarket/multi-leg-hedge';
export type { MultiLegHedgeConfig, MultiLegHedgeDeps } from '@desk/strategies/polymarket/multi-leg-hedge';

export { createRegimeAdaptiveMomentumTick } from '@desk/strategies/polymarket/regime-adaptive-momentum-v2';
export type { RegimeAdaptiveMomentumConfig, RegimeAdaptiveMomentumDeps } from '@desk/strategies/polymarket/regime-adaptive-momentum-v2';

export { createInventorySkewRebalancerTick } from '@desk/strategies/polymarket/inventory-skew-rebalancer';
export type { InventorySkewRebalancerConfig, InventorySkewRebalancerDeps } from '@desk/strategies/polymarket/inventory-skew-rebalancer';

export { createBollingerSqueezeTick } from '@desk/strategies/polymarket/bollinger-squeeze-v2';
export type { BollingerSqueezeConfig, BollingerSqueezeDeps } from '@desk/strategies/polymarket/bollinger-squeeze-v2';

export { createRelativeStrengthRotationTick } from '@desk/strategies/polymarket/relative-strength-rotation-v2';
export type { RelativeStrengthRotationConfig, RelativeStrengthRotationDeps } from '@desk/strategies/polymarket/relative-strength-rotation-v2';

export { createTimeWeightedMeanReversionTick } from '@desk/strategies/polymarket/time-weighted-mean-reversion-v2';
export type { TimeWeightedMeanReversionConfig, TimeWeightedMeanReversionDeps } from '@desk/strategies/polymarket/time-weighted-mean-reversion-v2';

export { createStaleQuoteSniperTick } from '@desk/strategies/polymarket/stale-quote-sniper-v2';
export type { StaleQuoteSniperConfig, StaleQuoteSniperDeps } from '@desk/strategies/polymarket/stale-quote-sniper-v2';

export { createMomentumCascadeTick } from '@desk/strategies/polymarket/momentum-cascade-v2';
export type { MomentumCascadeConfig, MomentumCascadeDeps } from '@desk/strategies/polymarket/momentum-cascade-v2';

export { createPriceImpactEstimatorTick } from '@desk/strategies/polymarket/price-impact-estimator';
export type { PriceImpactEstimatorConfig, PriceImpactEstimatorDeps } from '@desk/strategies/polymarket/price-impact-estimator';

export { createDecayRateMomentumTick } from '@desk/strategies/polymarket/decay-rate-momentum-v2';
export type { DecayRateMomentumConfig, DecayRateMomentumDeps } from '@desk/strategies/polymarket/decay-rate-momentum-v2';

export { createClusterBreakoutTick } from '@desk/strategies/polymarket/cluster-breakout-v2';
export type { ClusterBreakoutConfig, ClusterBreakoutDeps } from '@desk/strategies/polymarket/cluster-breakout-v2';

export { createGapFillReversionTick } from '@desk/strategies/polymarket/gap-fill-reversion-v2';
export type { GapFillReversionConfig, GapFillReversionDeps } from '@desk/strategies/polymarket/gap-fill-reversion-v2';

export { createRecencyBiasExploiterTick } from '@desk/strategies/polymarket/recency-bias-exploiter-v2';
export type { RecencyBiasExploiterConfig, RecencyBiasExploiterDeps } from '@desk/strategies/polymarket/recency-bias-exploiter-v2';

export { createWeightedSentimentAggregatorTick } from '@desk/strategies/polymarket/weighted-sentiment-aggregator-v2';
export type { WeightedSentimentAggregatorConfig, WeightedSentimentAggregatorDeps } from '@desk/strategies/polymarket/weighted-sentiment-aggregator-v2';

export { createOrderArrivalRateTick } from '@desk/strategies/polymarket/order-arrival-rate-v2';
export type { OrderArrivalRateConfig, OrderArrivalRateDeps } from '@desk/strategies/polymarket/order-arrival-rate-v2';

export { createRegimeSwitchDetectorTick } from '@desk/strategies/polymarket/regime-switch-detector-v2';
export type { RegimeSwitchDetectorConfig, RegimeSwitchDetectorDeps } from '@desk/strategies/polymarket/regime-switch-detector-v2';

export { createEventDeadlineScalperTick } from '@desk/strategies/polymarket/event-deadline-scalper-v2';
export type { EventDeadlineScalperConfig, EventDeadlineScalperDeps } from '@desk/strategies/polymarket/event-deadline-scalper-v2';

export { createCrossCorrelationLagTick } from '@desk/strategies/polymarket/cross-correlation-lag-v2';
export type { CrossCorrelationLagConfig, CrossCorrelationLagDeps } from '@desk/strategies/polymarket/cross-correlation-lag-v2';

export { createHerdBehaviorDetectorTick } from '@desk/strategies/polymarket/herd-behavior-detector-v2';
export type { HerdBehaviorDetectorConfig, HerdBehaviorDetectorDeps } from '@desk/strategies/polymarket/herd-behavior-detector-v2';

export { createInfoAsymmetryScannerTick } from '@desk/strategies/polymarket/info-asymmetry-scanner-v2';
export type { InfoAsymmetryScannerConfig, InfoAsymmetryScannerDeps } from '@desk/strategies/polymarket/info-asymmetry-scanner-v2';

export { createMeanVarianceOptimizerTick } from '@desk/strategies/polymarket/mean-variance-optimizer-v2';
export type { MeanVarianceOptimizerConfig, MeanVarianceOptimizerDeps } from '@desk/strategies/polymarket/mean-variance-optimizer-v2';

export { createPivotPointBounceTick } from '@desk/strategies/polymarket/pivot-point-bounce-v2';
export type { PivotPointBounceConfig, PivotPointBounceDeps } from '@desk/strategies/polymarket/pivot-point-bounce-v2';

export { createTailRiskHarvesterTick } from '@desk/strategies/polymarket/tail-risk-harvester-v2';
export type { TailRiskHarvesterConfig, TailRiskHarvesterDeps } from '@desk/strategies/polymarket/tail-risk-harvester-v2';

export { createMarkovChainPredictorTick } from '@desk/strategies/polymarket/markov-chain-predictor-v2';
export type { MarkovChainPredictorConfig, MarkovChainPredictorDeps } from '@desk/strategies/polymarket/markov-chain-predictor-v2';

export { createLiquidityMigrationTick } from '@desk/strategies/polymarket/liquidity-migration-v2';
export type { LiquidityMigrationConfig, LiquidityMigrationDeps } from '@desk/strategies/polymarket/liquidity-migration-v2';

export { createPriceAccelerationTick } from '@desk/strategies/polymarket/price-acceleration-v2';
export type { PriceAccelerationConfig, PriceAccelerationDeps } from '@desk/strategies/polymarket/price-acceleration-v2';

export { createSpreadMeanReversionTick } from '@desk/strategies/polymarket/spread-mean-reversion-v2';
export type { SpreadMeanReversionConfig, SpreadMeanReversionDeps } from '@desk/strategies/polymarket/spread-mean-reversion-v2';

export { createVolatilityTargetingTick } from '@desk/strategies/polymarket/volatility-targeting-v2';
export type { VolatilityTargetingConfig, VolatilityTargetingDeps } from '@desk/strategies/polymarket/volatility-targeting-v2';

export { createNegativeRiskScannerTick } from '@desk/strategies/polymarket/negative-risk-scanner';
export type {
  NegativeRiskScannerConfig,
  NegativeRiskScannerDeps,
} from '@desk/strategies/polymarket/negative-risk-scanner';
