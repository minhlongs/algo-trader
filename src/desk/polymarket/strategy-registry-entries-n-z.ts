import type { StrategyEntry } from './strategy-registry-types';

import { OrderArrivalRateStrategy, DEFAULT_CONFIG as OrderArrival } from '../strategies/polymarket/order-arrival-rate-v2';
import { PriceAccelerationStrategy, DEFAULT_CONFIG as PriceAccel } from '../strategies/polymarket/price-acceleration-v2';
import { RecencyBiasExploiterStrategy, DEFAULT_CONFIG as RecencyBias } from '../strategies/polymarket/recency-bias-exploiter-v2';
import { RegimeAdaptiveMomentumStrategy, DEFAULT_CONFIG as RegimeAdapt } from '../strategies/polymarket/regime-adaptive-momentum-v2';
import { RelativeStrengthRotationStrategy, DEFAULT_CONFIG as RelStrength } from '../strategies/polymarket/relative-strength-rotation-v2';
import { ResolutionFrontrunnerStrategy, DEFAULT_CONFIG as ResFront } from '../strategies/polymarket/resolution-frontrunner-v2';
import { StaleQuoteSniperStrategy, DEFAULT_CONFIG as StaleQuote } from '../strategies/polymarket/stale-quote-sniper-v2';
import { TailRiskHarvesterStrategy, DEFAULT_CONFIG as TailRisk } from '../strategies/polymarket/tail-risk-harvester-v2';
import { TimeWeightedMeanReversionStrategy, DEFAULT_CONFIG as TimeWMR } from '../strategies/polymarket/time-weighted-mean-reversion-v2';
import { VolCompressionBreakoutStrategy, DEFAULT_CONFIG as VolComBreak } from '../strategies/polymarket/vol-compression-breakout-v2';
import { VolatilityTargetingStrategy, DEFAULT_CONFIG as VolTarget } from '../strategies/polymarket/volatility-targeting-v2';
import { WeightedSentimentAggregatorStrategy, DEFAULT_CONFIG as WeightedSent } from '../strategies/polymarket/weighted-sentiment-aggregator-v2';
import { WhaleTrackerStrategy, DEFAULT_CONFIG as WhaleTrack } from '../strategies/polymarket/whale-tracker-v2';

export const REGISTRY_N_Z: Record<string, StrategyEntry> = {
  'order-arrival-rate': {
    name: 'order-arrival-rate',
    description: 'Signals on abnormal order arrival rate — detects informed trading flow',
    ctor: OrderArrivalRateStrategy,
    defaultConfig: OrderArrival,
  },
  'price-acceleration': {
    name: 'price-acceleration',
    description: 'Trades second-derivative price moves — acceleration, not just velocity',
    ctor: PriceAccelerationStrategy,
    defaultConfig: PriceAccel,
  },
  'recency-bias-exploiter': {
    name: 'recency-bias-exploiter',
    description: 'Exploits traders over-weighting recent events — fades recency-driven mispricing',
    ctor: RecencyBiasExploiterStrategy,
    defaultConfig: RecencyBias,
  },
  'regime-adaptive-momentum': {
    name: 'regime-adaptive-momentum',
    description: 'Momentum strategy that adapts lookback and sizing to detected market regime',
    ctor: RegimeAdaptiveMomentumStrategy,
    defaultConfig: RegimeAdapt,
  },
  'relative-strength-rotation': {
    name: 'relative-strength-rotation',
    description: 'Rotates capital between tokens based on relative strength (RS) rankings',
    ctor: RelativeStrengthRotationStrategy,
    defaultConfig: RelStrength,
  },
  'resolution-frontrunner': {
    name: 'resolution-frontrunner',
    description: 'Front-runs markets nearing resolution with high probability outcomes',
    ctor: ResolutionFrontrunnerStrategy,
    defaultConfig: ResFront,
  },
  'stale-quote-sniper': {
    name: 'stale-quote-sniper',
    description: 'Snipes stale quotes that haven\'t updated to reflect new information',
    ctor: StaleQuoteSniperStrategy,
    defaultConfig: StaleQuote,
  },
  'tail-risk-harvester': {
    name: 'tail-risk-harvester',
    description: 'Harvests premium by selling tail risk in binary option markets',
    ctor: TailRiskHarvesterStrategy,
    defaultConfig: TailRisk,
  },
  'time-weighted-mean-reversion': {
    name: 'time-weighted-mean-reversion',
    description: 'Mean-reversion with time-of-day weighting — stronger signals during active hours',
    ctor: TimeWeightedMeanReversionStrategy,
    defaultConfig: TimeWMR,
  },
  'vol-compression-breakout': {
    name: 'vol-compression-breakout',
    description: 'Enters when volatility compresses below threshold then breaks out',
    ctor: VolCompressionBreakoutStrategy,
    defaultConfig: VolComBreak,
  },
  'volatility-targeting': {
    name: 'volatility-targeting',
    description: 'Dynamically sizes positions to target a constant volatility level',
    ctor: VolatilityTargetingStrategy,
    defaultConfig: VolTarget,
  },
  'weighted-sentiment-aggregator': {
    name: 'weighted-sentiment-aggregator',
    description: 'Aggregates weighted sentiment signals from multiple sources into trade decisions',
    ctor: WeightedSentimentAggregatorStrategy,
    defaultConfig: WeightedSent,
  },
  'whale-tracker': {
    name: 'whale-tracker',
    description: 'Tracks large wallet activity and mirrors whale trades with delay',
    ctor: WhaleTrackerStrategy,
    defaultConfig: WhaleTrack,
  },
};
