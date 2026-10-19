/**
 * Biais et al. (1995) Markov Transition Matrix & Diagonal Clustering.
 * Calculates order flow persistence, event clustering, and transition probabilities.
 * Strictly < 180 LOC, zero :any types.
 */

import {
  ALL_LOB_EVENT_TYPES,
  DiagonalClusteringSummary,
  LobEvent,
  LobEventType,
} from './biais-types';

export function buildEventFrequencies(
  events: readonly LobEvent[]
): Record<LobEventType, number> {
  const freqs: Record<LobEventType, number> = {
    MARKET_BUY: 0,
    MARKET_SELL: 0,
    LIMIT_BUY_WITHIN: 0,
    LIMIT_SELL_WITHIN: 0,
    LIMIT_BUY_BEST: 0,
    LIMIT_SELL_BEST: 0,
    CANCEL_BID: 0,
    CANCEL_ASK: 0,
  };

  for (const ev of events) {
    freqs[ev.type] = (freqs[ev.type] ?? 0) + 1;
  }
  return freqs;
}

export function buildTransitionMatrix(
  events: readonly LobEvent[]
): {
  matrix: Record<LobEventType, Record<LobEventType, number>>;
  counts: Record<LobEventType, Record<LobEventType, number>>;
} {
  const counts: Record<LobEventType, Record<LobEventType, number>> = {
    MARKET_BUY: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    MARKET_SELL: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    LIMIT_BUY_WITHIN: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    LIMIT_SELL_WITHIN: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    LIMIT_BUY_BEST: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    LIMIT_SELL_BEST: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    CANCEL_BID: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    CANCEL_ASK: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
  };

  for (let i = 0; i < events.length - 1; i++) {
    const from = events[i].type;
    const to = events[i + 1].type;
    counts[from][to] += 1;
  }

  const matrix: Record<LobEventType, Record<LobEventType, number>> = {
    MARKET_BUY: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    MARKET_SELL: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    LIMIT_BUY_WITHIN: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    LIMIT_SELL_WITHIN: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    LIMIT_BUY_BEST: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    LIMIT_SELL_BEST: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    CANCEL_BID: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
    CANCEL_ASK: { MARKET_BUY: 0, MARKET_SELL: 0, LIMIT_BUY_WITHIN: 0, LIMIT_SELL_WITHIN: 0, LIMIT_BUY_BEST: 0, LIMIT_SELL_BEST: 0, CANCEL_BID: 0, CANCEL_ASK: 0 },
  };

  for (const from of ALL_LOB_EVENT_TYPES) {
    let rowSum = 0;
    for (const to of ALL_LOB_EVENT_TYPES) {
      rowSum += counts[from][to];
    }
    for (const to of ALL_LOB_EVENT_TYPES) {
      matrix[from][to] = rowSum > 0 ? counts[from][to] / rowSum : 1 / ALL_LOB_EVENT_TYPES.length;
    }
  }

  return { matrix, counts };
}

export function evaluateDiagonalClustering(
  matrix: Record<LobEventType, Record<LobEventType, number>>,
  frequencies: Record<LobEventType, number>,
  totalEvents: number
): readonly DiagonalClusteringSummary[] {
  return ALL_LOB_EVENT_TYPES.map((type) => {
    const selfTransitionProb = matrix[type][type];
    const baselineProb = totalEvents > 0 ? (frequencies[type] ?? 0) / totalEvents : 0.125;
    const clusteringLift = baselineProb > 0 ? selfTransitionProb / baselineProb : 1.0;

    return {
      eventType: type,
      selfTransitionProb,
      baselineProb,
      clusteringLift,
    };
  });
}
