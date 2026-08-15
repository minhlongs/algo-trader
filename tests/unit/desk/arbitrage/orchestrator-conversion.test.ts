/**
 * Test orchestrator-conversion module
 */

import { describe, it, expect } from 'vitest';
import {
  convertToUnifiedOpportunity,
  confidenceToNumeric,
  matchesStrategyFilter,
} from '../../../../src/desk/arbitrage/orchestrator-conversion';
import type { ArbitrageOpportunity } from '../../../../src/desk/arbitrage/types';
import type { ArbitrageOpportunity as SpreadArbitrageOpportunity } from '../../../../src/desk/arbitrage/spread-detector';

describe('orchestrator-conversion', () => {
  describe('convertToUnifiedOpportunity', () => {
    it('converts spread opportunity to unified format', () => {
      const spreadOpp: SpreadArbitrageOpportunity = {
        id: 'spread-001',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'okx',
        buyPrice: 60000,
        sellPrice: 60050,
        spread: 50,
        spreadPercent: 0.083,
        confidence: 'high',
        timestamp: 1700000000000,
        fees: { buyFee: 15, sellFee: 15 },
      };

      const result = convertToUnifiedOpportunity(spreadOpp);

      expect(result.id).toBe('spread-001');
      expect(result.type).toBe('cross-exchange');
      expect(result.legs).toHaveLength(2);
      expect(result.legs[0].exchange).toBe('binance');
      expect(result.legs[0].side).toBe('buy');
      expect(result.legs[0].price).toBe(60000);
      expect(result.legs[1].exchange).toBe('okx');
      expect(result.legs[1].side).toBe('sell');
      expect(result.legs[1].price).toBe(60050);
      expect(result.expectedProfit).toBe(50);
      expect(result.expectedProfitPct).toBe(0.083);
      expect(result.totalFees).toBe(30);
      expect(result.confidence).toBe(95); // high = 95
      expect(result.detectedAt).toBe(1700000000000);
      expect(result.expiresAt).toBe(1700000005000); // +5000ms
    });

    it('uses default fees when not provided', () => {
      const spreadOpp: SpreadArbitrageOpportunity = {
        id: 'spread-002',
        symbol: 'ETH/USDT',
        buyExchange: 'binance',
        sellExchange: 'okx',
        buyPrice: 3000,
        sellPrice: 3005,
        spread: 5,
        spreadPercent: 0.167,
        timestamp: 1700000000000,
      };

      const result = convertToUnifiedOpportunity(spreadOpp);

      expect(result.totalFees).toBe(0);
      expect(result.legs[0].fee).toBe(0);
      expect(result.legs[1].fee).toBe(0);
    });

    it('calculates amounts based on 1000 base', () => {
      const spreadOpp: SpreadArbitrageOpportunity = {
        id: 'spread-003',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'okx',
        buyPrice: 50000,
        sellPrice: 50050,
        spread: 50,
        spreadPercent: 0.1,
        timestamp: 1700000000000,
      };

      const result = convertToUnifiedOpportunity(spreadOpp);

      expect(result.legs[0].amount).toBeCloseTo(1000 / 50000, 6);
      expect(result.legs[1].amount).toBeCloseTo(1000 / 50050, 6);
    });
  });

  describe('confidenceToNumeric', () => {
    it('returns 95 for high', () => {
      expect(confidenceToNumeric('high')).toBe(95);
    });

    it('returns 70 for medium', () => {
      expect(confidenceToNumeric('medium')).toBe(70);
    });

    it('returns 40 for low', () => {
      expect(confidenceToNumeric('low')).toBe(40);
    });

    it('returns 50 for undefined', () => {
      expect(confidenceToNumeric(undefined)).toBe(50);
    });
  });

  describe('matchesStrategyFilter', () => {
    const baseOpp: ArbitrageOpportunity = {
      id: 'opp-1',
      type: 'cross-exchange',
      legs: [],
      expectedProfit: 0.05,
      expectedProfitPct: 0.5,
      totalFees: 0.01,
      confidence: 85,
      detectedAt: Date.now(),
      expiresAt: Date.now() + 5000,
    };

    it('returns true for strategy "all"', () => {
      expect(matchesStrategyFilter(baseOpp, 'all')).toBe(true);
    });

    it('returns true for matching cross-exchange strategy', () => {
      expect(matchesStrategyFilter(baseOpp, 'cross-exchange')).toBe(true);
    });

    it('returns false for non-matching strategy', () => {
      expect(matchesStrategyFilter(baseOpp, 'triangular')).toBe(false);
    });

    it('returns true for matching triangular strategy', () => {
      const triangularOpp: ArbitrageOpportunity = { ...baseOpp, type: 'triangular' };
      expect(matchesStrategyFilter(triangularOpp, 'triangular')).toBe(true);
    });

    it('returns true for matching dex-cex strategy', () => {
      const dexCexOpp: ArbitrageOpportunity = { ...baseOpp, type: 'dex-cex' };
      expect(matchesStrategyFilter(dexCexOpp, 'dex-cex')).toBe(true);
    });

    it('returns true for matching funding-rate strategy', () => {
      const fundingOpp: ArbitrageOpportunity = { ...baseOpp, type: 'funding-rate' };
      expect(matchesStrategyFilter(fundingOpp, 'funding-rate')).toBe(true);
    });

    it('returns true for matching binary-arb strategy', () => {
      const binaryOpp: ArbitrageOpportunity = { ...baseOpp, type: 'binary-arb' };
      expect(matchesStrategyFilter(binaryOpp, 'binary-arb')).toBe(true);
    });

    it('returns true for split-merge matching settlement-arb type', () => {
      const splitOpp: ArbitrageOpportunity = { ...baseOpp, type: 'settlement-arb' };
      expect(matchesStrategyFilter(splitOpp, 'split-merge')).toBe(true);
    });

    it('returns true for matching cross-market strategy', () => {
      const crossMarketOpp: ArbitrageOpportunity = { ...baseOpp, type: 'cross-market' };
      expect(matchesStrategyFilter(crossMarketOpp, 'cross-market')).toBe(true);
    });

    it('returns false for unknown strategy', () => {
      expect(matchesStrategyFilter(baseOpp, 'unknown-strategy')).toBe(false);
    });
  });
});
