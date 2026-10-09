/**
 * Unit Tests for Biais, Hillion, Spatt (1995) LOB Order Flow Transition Dynamics.
 * Strictly zero-mock, real market microstructure math, strictly < 180 LOC.
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_LOB_EVENT_TYPES,
  BiaisOrderFlowEngine,
  LobEvent,
} from '../../../../src/desk/biais';

describe('Biais, Hillion, Spatt (1995) LOB Order Flow Suite', () => {
  // Realistic sequence of LOB events exhibiting diagonal clustering and spread-dependent choice
  const sampleEvents: readonly LobEvent[] = [
    // Cluster 1: Market buys (order slicing / iceberg execution)
    { timestamp: 1000, type: 'MARKET_BUY', price: 100.5, volume: 50, spreadTicks: 1, bidDepth: 200, askDepth: 100 },
    { timestamp: 1002, type: 'MARKET_BUY', price: 100.5, volume: 30, spreadTicks: 1, bidDepth: 200, askDepth: 70 },
    { timestamp: 1005, type: 'MARKET_BUY', price: 100.5, volume: 40, spreadTicks: 1, bidDepth: 200, askDepth: 30 },
    // Cluster 2: Wide spread triggers inside-spread limit orders (liquidity provision)
    { timestamp: 1010, type: 'LIMIT_BUY_WITHIN', price: 100.25, volume: 100, spreadTicks: 3, bidDepth: 200, askDepth: 50 },
    { timestamp: 1012, type: 'LIMIT_SELL_WITHIN', price: 100.35, volume: 100, spreadTicks: 2, bidDepth: 300, askDepth: 50 },
    // Cluster 3: Cancellations follow cancellations
    { timestamp: 1015, type: 'CANCEL_BID', price: 100.1, volume: 50, spreadTicks: 1, bidDepth: 250, askDepth: 150 },
    { timestamp: 1016, type: 'CANCEL_BID', price: 100.0, volume: 50, spreadTicks: 1, bidDepth: 200, askDepth: 150 },
    // Cluster 4: Market sells
    { timestamp: 1020, type: 'MARKET_SELL', price: 100.2, volume: 80, spreadTicks: 1, bidDepth: 150, askDepth: 150 },
    { timestamp: 1022, type: 'MARKET_SELL', price: 100.2, volume: 60, spreadTicks: 1, bidDepth: 70, askDepth: 150 },
    // Cluster 5: Joining best quote
    { timestamp: 1025, type: 'LIMIT_BUY_BEST', price: 100.2, volume: 50, spreadTicks: 1, bidDepth: 120, askDepth: 150 },
    { timestamp: 1026, type: 'LIMIT_BUY_BEST', price: 100.2, volume: 50, spreadTicks: 1, bidDepth: 170, askDepth: 150 },
  ];

  it('computes stochastic transition matrix with valid probability distributions', () => {
    const engine = new BiaisOrderFlowEngine();
    const result = engine.analyze(sampleEvents);

    expect(result.totalEvents).toBe(sampleEvents.length);

    // Each row of transition matrix must sum to 1.0 (within numerical precision)
    for (const fromType of ALL_LOB_EVENT_TYPES) {
      let rowSum = 0;
      for (const toType of ALL_LOB_EVENT_TYPES) {
        const prob = result.transitionMatrix[fromType][toType];
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1.0);
        rowSum += prob;
      }
      expect(rowSum).toBeCloseTo(1.0, 4);
    }
  });

  it('confirms diagonal clustering phenomenon (elevated self-transition probability)', () => {
    const engine = new BiaisOrderFlowEngine();
    const result = engine.analyze(sampleEvents);

    // MARKET_BUY self-transition: 2 transitions out of 3 total MARKET_BUY source events
    const marketBuyClustering = result.diagonalClustering.find(
      (c) => c.eventType === 'MARKET_BUY'
    );
    expect(marketBuyClustering).toBeDefined();
    expect(marketBuyClustering!.selfTransitionProb).toBeGreaterThan(0.5);
    // Clustering lift should be > 1.0 (self transition > unconditional baseline frequency)
    expect(marketBuyClustering!.clusteringLift).toBeGreaterThan(1.0);

    // CANCEL_BID self-transition: 1 transition out of 2 total
    const cancelBidClustering = result.diagonalClustering.find(
      (c) => c.eventType === 'CANCEL_BID'
    );
    expect(cancelBidClustering).toBeDefined();
    expect(cancelBidClustering!.selfTransitionProb).toBeGreaterThan(0.4);
    expect(cancelBidClustering!.clusteringLift).toBeGreaterThan(1.0);
  });

  it('demonstrates spread-conditional liquidity provision vs market consumption', () => {
    const engine = new BiaisOrderFlowEngine();
    const result = engine.analyze(sampleEvents);

    const tightStats = result.spreadDynamics.find(
      (s) => s.spreadRegime === 'TIGHT_SPREAD'
    );
    const wideStats = result.spreadDynamics.find(
      (s) => s.spreadRegime === 'WIDE_SPREAD'
    );

    expect(tightStats).toBeDefined();
    expect(wideStats).toBeDefined();

    // In wide spread regime, ratio of inside-spread limit orders should be strictly positive
    expect(wideStats!.insideSpreadLimitRatio).toBeGreaterThan(0.5);

    // In tight spread regime, market order ratio should dominate inside spread orders
    expect(tightStats!.marketOrderRatio).toBeGreaterThan(0.3);
    expect(tightStats!.insideSpreadLimitRatio).toBe(0.0);
  });

  it('evaluates order flow momentum and predicts next likely transition', () => {
    const engine = new BiaisOrderFlowEngine();
    const result = engine.analyze(sampleEvents);

    // Overall momentum index should be positive due to consecutive buy/sell clustering
    expect(result.orderFlowMomentum).toBeGreaterThan(0);

    const prediction = engine.predictNextTransition('MARKET_BUY', result);
    expect(prediction.topTransitions[0].target).toBe('MARKET_BUY');
    expect(prediction.isDiagonalClustered).toBe(true);
  });

  it('rejects empty event sequence with informative error', () => {
    const engine = new BiaisOrderFlowEngine();
    expect(() => engine.analyze([])).toThrow('Cannot analyze empty LOB');
  });
});
