/**
 * Topic Schema Tests
 * Covers: Topics constant, marketTopic function.
 */

import { describe, it, expect } from 'vitest';
import { Topics, marketTopic } from '../topic-schema';

describe('topic-schema', () => {
  describe('Topics', () => {
    it('exports all topic constants', () => {
      expect(Topics.MARKET_UPDATE).toBe('market.*.update');
      expect(Topics.MARKET_ORDERBOOK).toBe('market.*.orderbook');
      expect(Topics.MARKET_PRICE).toBe('market.*.price');
      expect(Topics.SIGNAL_SIMPLE_ARB).toBe('signal.simple-arb.detected');
      expect(Topics.SIGNAL_CROSS_MARKET).toBe('signal.cross-market.candidate');
      expect(Topics.SIGNAL_DELTA_NEUTRAL).toBe('signal.delta-neutral.candidate');
      expect(Topics.SIGNAL_MULTI_LEG).toBe('signal.multi-leg.optimized');
      expect(Topics.INTELLIGENCE_DEPENDENCIES).toBe('intelligence.dependencies.updated');
      expect(Topics.INTELLIGENCE_SENTIMENT).toBe('intelligence.sentiment.updated');
      expect(Topics.RISK_ALERT).toBe('risk.alert');
      expect(Topics.RISK_CIRCUIT_BREAKER).toBe('risk.circuit-breaker.triggered');
      expect(Topics.RISK_POSITION_LIMIT).toBe('risk.position-limit.reached');
      expect(Topics.ORDER_PLACED).toBe('order.placed');
      expect(Topics.ORDER_FILLED).toBe('order.filled');
      expect(Topics.ORDER_CANCELLED).toBe('order.cancelled');
      expect(Topics.ORDER_FAILED).toBe('order.failed');
      expect(Topics.SYSTEM_HEALTH).toBe('system.health');
      expect(Topics.SYSTEM_METRICS).toBe('system.metrics');
    });
  });

  describe('marketTopic', () => {
    it('replaces wildcard with marketId', () => {
      expect(marketTopic('market.*.update', 'BTC-USD')).toBe('market.BTC-USD.update');
    });

    it('replaces wildcard in signal topics', () => {
      expect(marketTopic('market.*.price', 'ETH-USD')).toBe('market.ETH-USD.price');
    });

    it('returns unchanged string when no wildcard', () => {
      expect(marketTopic('order.placed', 'BTC-USD')).toBe('order.placed');
    });

    it('replaces only first wildcard', () => {
      expect(marketTopic('market.*.update.*', 'X')).toBe('market.X.update.*');
    });
  });
});
