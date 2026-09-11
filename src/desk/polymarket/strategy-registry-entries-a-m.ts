import type { StrategyEntry } from './strategy-registry-types';

import { SpreadMeanReversionStrategy, DEFAULT_CONFIG as SpreadMR } from '../strategies/polymarket/spread-mean-reversion-v2';
import { BollingerSqueezeStrategy, DEFAULT_CONFIG as Bollinger } from '../strategies/polymarket/bollinger-squeeze-v2';
import { VwapDeviationSniperStrategy, DEFAULT_CONFIG as VwapDev } from '../strategies/polymarket/vwap-deviation-sniper-v2';
import { MomentumCascadeStrategy, DEFAULT_CONFIG as MomCasc } from '../strategies/polymarket/momentum-cascade-v2';
import { CrossEventDriftStrategy, DEFAULT_CONFIG as CrossEv } from '../strategies/polymarket/cross-event-drift-v2';
import { DecayRateMomentumStrategy, DEFAULT_CONFIG as Decay } from '../strategies/polymarket/decay-rate-momentum-v2';
import { EventDeadlineScalperStrategy, DEFAULT_CONFIG as EvtDead } from '../strategies/polymarket/event-deadline-scalper-v2';
import { GapFillReversionStrategy, DEFAULT_CONFIG as GapFill } from '../strategies/polymarket/gap-fill-reversion-v2';
import { LiquidityMigrationStrategy, DEFAULT_CONFIG as LiqMig } from '../strategies/polymarket/liquidity-migration-v2';
import { OrderbookDepthRatioStrategy, DEFAULT_CONFIG as OBDepth } from '../strategies/polymarket/orderbook-depth-ratio-v2';
import { PivotPointBounceStrategy, DEFAULT_CONFIG as Pivot } from '../strategies/polymarket/pivot-point-bounce-v2';
import { RegimeSwitchDetectorStrategy, DEFAULT_CONFIG as Regime } from '../strategies/polymarket/regime-switch-detector-v2';
import { ClusterBreakoutStrategy, DEFAULT_CONFIG as ClusterBreakout } from '../strategies/polymarket/cluster-breakout-v2';
import { CrossCorrelationLagStrategy, DEFAULT_CONFIG as CrossCorrLag } from '../strategies/polymarket/cross-correlation-lag-v2';
import { HerdBehaviorDetectorStrategy, DEFAULT_CONFIG as HerdBehavior } from '../strategies/polymarket/herd-behavior-detector-v2';
import { InfoAsymmetryScannerStrategy, DEFAULT_CONFIG as InfoAsym } from '../strategies/polymarket/info-asymmetry-scanner-v2';
import { MarkovChainPredictorStrategy, DEFAULT_CONFIG as MarkovChain } from '../strategies/polymarket/markov-chain-predictor-v2';
import { MeanVarianceOptimizerStrategy, DEFAULT_CONFIG as MeanVar } from '../strategies/polymarket/mean-variance-optimizer-v2';
import { ListingArbitrageSniper, DEFAULT_LISTING_ARB_CONFIG as ListingArb } from '../strategies/polymarket/listing-arbitrage-sniper';

export const REGISTRY_A_M: Record<string, StrategyEntry> = {
  'spread-mean-reversion': {
    name: 'spread-mean-reversion',
    description: 'Trades yes/no spread deviations back toward equilibrium (1.0)',
    ctor: SpreadMeanReversionStrategy,
    defaultConfig: SpreadMR,
  },
  'bollinger-squeeze': {
    name: 'bollinger-squeeze',
    description: 'Enters when Bollinger Bands tighten — signals imminent breakout',
    ctor: BollingerSqueezeStrategy,
    defaultConfig: Bollinger,
  },
  'vwap-deviation-sniper': {
    name: 'vwap-deviation-sniper',
    description: 'Enters when price deviates significantly from VWAP, reversion play',
    ctor: VwapDeviationSniperStrategy,
    defaultConfig: VwapDev,
  },
  'momentum-cascade': {
    name: 'momentum-cascade',
    description: 'Rides strong directional moves with cascading position entries',
    ctor: MomentumCascadeStrategy,
    defaultConfig: MomCasc,
  },
  'cross-event-drift': {
    name: 'cross-event-drift',
    description: 'Exploits price divergence between related event markets',
    ctor: CrossEventDriftStrategy,
    defaultConfig: CrossEv,
  },
  'decay-rate-momentum': {
    name: 'decay-rate-momentum',
    description: 'Trades accelerating price decay toward resolution',
    ctor: DecayRateMomentumStrategy,
    defaultConfig: Decay,
  },
  'event-deadline-scalper': {
    name: 'event-deadline-scalper',
    description: 'Scalps markets approaching event deadlines with thin spreads',
    ctor: EventDeadlineScalperStrategy,
    defaultConfig: EvtDead,
  },
  'gap-fill-reversion': {
    name: 'gap-fill-reversion',
    description: 'Mean-reverts after sudden price gaps in binary markets',
    ctor: GapFillReversionStrategy,
    defaultConfig: GapFill,
  },
  'liquidity-migration': {
    name: 'liquidity-migration',
    description: 'Tracks liquidity flowing between related tokens',
    ctor: LiquidityMigrationStrategy,
    defaultConfig: LiqMig,
  },
  'orderbook-depth-ratio': {
    name: 'orderbook-depth-ratio',
    description: 'Signals on bid/ask depth imbalances in the CLOB',
    ctor: OrderbookDepthRatioStrategy,
    defaultConfig: OBDepth,
  },
  'pivot-point-bounce': {
    name: 'pivot-point-bounce',
    description: 'Bounces off calculated pivot support/resistance levels',
    ctor: PivotPointBounceStrategy,
    defaultConfig: Pivot,
  },
  'regime-switch-detector': {
    name: 'regime-switch-detector',
    description: 'Detects market regime changes and adapts strategy accordingly',
    ctor: RegimeSwitchDetectorStrategy,
    defaultConfig: Regime,
  },
  'cluster-breakout': {
    name: 'cluster-breakout',
    description: 'Enters on volume cluster breakouts above threshold with momentum confirmation',
    ctor: ClusterBreakoutStrategy,
    defaultConfig: ClusterBreakout,
  },
  'cross-correlation-lag': {
    name: 'cross-correlation-lag',
    description: 'Trades lagged cross-correlation signals between related Polymarket tokens',
    ctor: CrossCorrelationLagStrategy,
    defaultConfig: CrossCorrLag,
  },
  'herd-behavior-detector': {
    name: 'herd-behavior-detector',
    description: 'Detects and fades herd behavior — buys when crowd sells, sells when crowd buys',
    ctor: HerdBehaviorDetectorStrategy,
    defaultConfig: HerdBehavior,
  },
  'info-asymmetry-scanner': {
    name: 'info-asymmetry-scanner',
    description: 'Scans for information asymmetry patterns in order flow and market data',
    ctor: InfoAsymmetryScannerStrategy,
    defaultConfig: InfoAsym,
  },
  'markov-chain-predictor': {
    name: 'markov-chain-predictor',
    description: 'Uses Markov chain state transitions to predict next price moves',
    ctor: MarkovChainPredictorStrategy,
    defaultConfig: MarkovChain,
  },
  'mean-variance-optimizer': {
    name: 'mean-variance-optimizer',
    description: 'Optimizes portfolio allocation using mean-variance framework across markets',
    ctor: MeanVarianceOptimizerStrategy,
    defaultConfig: MeanVar,
  },
  'listing-arbitrage-sniper': {
    name: 'listing-arbitrage-sniper',
    description: 'Snipes newly listed markets before liquidity concentrates — wide spread entry, convergence exit',
    ctor: ListingArbitrageSniper,
    defaultConfig: ListingArb,
  },
};
