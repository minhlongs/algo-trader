/**
 * Biais, Hillion, Spatt (1995) LOB Order Flow Transition Dynamics Types.
 * Seminal Paper: Bruno Biais, Pierre Hillion, Chester Spatt (1995),
 * "An Empirical Analysis of the Limit Order Book and the Order Flow in the Paris Bourse",
 * The Journal of Finance, 50(5):1655-1689.
 * Strictly < 180 LOC, zero :any types.
 */

export type LobEventType =
  | 'MARKET_BUY'
  | 'MARKET_SELL'
  | 'LIMIT_BUY_WITHIN'
  | 'LIMIT_SELL_WITHIN'
  | 'LIMIT_BUY_BEST'
  | 'LIMIT_SELL_BEST'
  | 'CANCEL_BID'
  | 'CANCEL_ASK';

export const ALL_LOB_EVENT_TYPES: readonly LobEventType[] = [
  'MARKET_BUY',
  'MARKET_SELL',
  'LIMIT_BUY_WITHIN',
  'LIMIT_SELL_WITHIN',
  'LIMIT_BUY_BEST',
  'LIMIT_SELL_BEST',
  'CANCEL_BID',
  'CANCEL_ASK',
];

export interface LobEvent {
  readonly timestamp: number;
  readonly type: LobEventType;
  readonly price: number;
  readonly volume: number;
  readonly spreadTicks: number;
  readonly bidDepth: number;
  readonly askDepth: number;
}

export interface TransitionProb {
  readonly from: LobEventType;
  readonly to: LobEventType;
  readonly count: number;
  readonly probability: number;
}

export interface DiagonalClusteringSummary {
  readonly eventType: LobEventType;
  readonly selfTransitionProb: number;
  readonly baselineProb: number;
  readonly clusteringLift: number; // selfTransitionProb / baselineProb
}

export interface SpreadConditionalStats {
  readonly spreadRegime: 'TIGHT_SPREAD' | 'WIDE_SPREAD';
  readonly sampleCount: number;
  readonly marketOrderRatio: number;
  readonly insideSpreadLimitRatio: number;
  readonly joinBestQuoteRatio: number;
}

export interface BiaisAnalysisResult {
  readonly totalEvents: number;
  readonly eventFrequencies: Readonly<Record<LobEventType, number>>;
  readonly transitionMatrix: Readonly<Record<LobEventType, Readonly<Record<LobEventType, number>>>>;
  readonly diagonalClustering: readonly DiagonalClusteringSummary[];
  readonly spreadDynamics: readonly SpreadConditionalStats[];
  readonly orderFlowMomentum: number; // Buy-Buy vs Sell-Sell persistence index
}
