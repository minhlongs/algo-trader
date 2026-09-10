/**
 * Strategy Registry — Entries O through Z (regime-adaptive-momentum → cycle-end-sniper)
 *
 * Submodule extracted from strategy-registry-full.ts to keep files under 200 lines.
 * Re-exported via strategy-registry-full.ts facade.
 */

import type { StrategyEntry } from './strategy-registry-full-entries-a-n';

// V2 strategies
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
import { ListingArbitrageSniper, DEFAULT_LISTING_ARB_CONFIG as ListingArb } from '../strategies/polymarket/listing-arbitrage-sniper';

// Non-V2 strategies (different class hierarchy)
import { CrossMarketArbStrategy } from '../strategies/polymarket/cross-market-arb';
import { MarketMakerStrategy } from '../strategies/polymarket/market-maker';
import { ExpiryThetaDecayStrategy, DEFAULT_CONFIG as ExpiryTheta } from '../strategies/polymarket/expiry-theta-decay';
import { scanCycleEndOpportunities } from '../strategies/polymarket/cycle-end-sniper';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const REGISTRY_O_Z: Record<string, StrategyEntry> = {
  'regime-adaptive-momentum': { name: 'regime-adaptive-momentum', description: 'Momentum strategy that adapts lookback and sizing to detected market regime', ctor: RegimeAdaptiveMomentumStrategy, defaultConfig: RegimeAdapt as any },
  'relative-strength-rotation': { name: 'relative-strength-rotation', description: 'Rotates capital between tokens based on relative strength (RS) rankings', ctor: RelativeStrengthRotationStrategy, defaultConfig: RelStrength as any },
  'resolution-frontrunner': { name: 'resolution-frontrunner', description: 'Front-runs markets nearing resolution with high probability outcomes', ctor: ResolutionFrontrunnerStrategy, defaultConfig: ResFront as any },
  'stale-quote-sniper': { name: 'stale-quote-sniper', description: 'Snipes stale quotes that haven\'t updated to reflect new information', ctor: StaleQuoteSniperStrategy, defaultConfig: StaleQuote as any },
  'tail-risk-harvester': { name: 'tail-risk-harvester', description: 'Harvests premium by selling tail risk in binary option markets', ctor: TailRiskHarvesterStrategy, defaultConfig: TailRisk as any },
  'time-weighted-mean-reversion': { name: 'time-weighted-mean-reversion', description: 'Mean-reversion with time-of-day weighting — stronger signals during active hours', ctor: TimeWeightedMeanReversionStrategy, defaultConfig: TimeWMR as any },
  'vol-compression-breakout': { name: 'vol-compression-breakout', description: 'Enters when volatility compresses below threshold then breaks out', ctor: VolCompressionBreakoutStrategy, defaultConfig: VolComBreak as any },
  'volatility-targeting': { name: 'volatility-targeting', description: 'Dynamically sizes positions to target a constant volatility level', ctor: VolatilityTargetingStrategy, defaultConfig: VolTarget as any },
  'weighted-sentiment-aggregator': { name: 'weighted-sentiment-aggregator', description: 'Aggregates weighted sentiment signals from multiple sources into trade decisions', ctor: WeightedSentimentAggregatorStrategy, defaultConfig: WeightedSent as any },
  'whale-tracker': { name: 'whale-tracker', description: 'Tracks large wallet activity and mirrors whale trades with delay', ctor: WhaleTrackerStrategy, defaultConfig: WhaleTrack as any },
  'listing-arbitrage-sniper': { name: 'listing-arbitrage-sniper', description: 'Snipes newly listed markets before liquidity concentrates — wide spread entry, convergence exit', ctor: ListingArbitrageSniper, defaultConfig: ListingArb as any },
  'cross-market-arb': { name: 'cross-market-arb', description: 'Detects price discrepancies between Polymarket and external prediction markets on the same event', ctor: CrossMarketArbStrategy as any, defaultConfig: { minBasis: 0.05, exitBasis: 0.02, defaultSizeUsdc: 50, maxPositions: 3 } as any },
  'market-maker': { name: 'market-maker', description: 'Two-sided liquidity provision on Polymarket — captures spread via bid/ask around fair value', ctor: MarketMakerStrategy as any, defaultConfig: { baseSpread: 0.02, quoteSizeUsdc: 25, refreshIntervalMs: 20000, maxInventorySkew: 3, minLiquidity: 5000 } as any },
  'expiry-theta-decay': { name: 'expiry-theta-decay', description: 'Captures time-decay premium as resolution date approaches — sells high certainty, buys cheap ambiguity', ctor: ExpiryThetaDecayStrategy as any, defaultConfig: { ...ExpiryTheta } as any },
  'cycle-end-sniper': { name: 'cycle-end-sniper', description: 'Scalps markets in the final 5 min before resolution — edge on certainty convergence', ctor: scanCycleEndOpportunities as any, defaultConfig: { fee: 0.02, certaintyThreshold: 0.95, snipeWindowMs: 300000, entryWindowMs: 60000, minVolume: 10000, minProfit: 0.005 } as any },
};
