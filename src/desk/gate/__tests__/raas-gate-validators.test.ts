/**
 * RaaS Gate Validator Tests
 * Pure validator function tests for ROIaaS license tiers, limits, and pricing.
 */

import { describe, it, expect } from 'vitest';
import { LicenseTier } from '../../../shared/types/license';
import {
  parseLicenseTier as parseTier,
  isFeatureEnabled as isFeature,
  getTierLevel as tierLevel,
  getRateLimits as rateLimits,
  getDailyLimit as dailyLimit,
  getOveragePrice as overagePrice,
} from '../validators';

describe('raas-gate validators', () => {
  describe('parseLicenseTier', () => {
    it('should parse FREE tier from key', () => {
      expect(parseTier('RAAS-FREE-ABC12345-DEF67890')).toBe(LicenseTier.FREE);
      expect(parseTier('FREE-ABC12345-DEF67890')).toBe(LicenseTier.FREE);
    });

    it('should parse PRO tier from key', () => {
      expect(parseTier('RAAS-PRO-ABC12345-DEF67890')).toBe(LicenseTier.PRO);
      expect(parseTier('RPP-ABC12345-DEF67890')).toBe(LicenseTier.PRO);
      expect(parseTier('RAAS-RPP-ABC12345-DEF67890')).toBe(LicenseTier.PRO);
    });

    it('should parse STARTER tier from key', () => {
      expect(parseTier('RAAS-RST-ABC12345-DEF67890')).toBe(LicenseTier.STARTER);
      expect(parseTier('RST-ABC12345-DEF67890')).toBe(LicenseTier.STARTER);
    });

    it('should parse ENTERPRISE tier from key', () => {
      expect(parseTier('RAAS-ENT-ABC12345-DEF67890')).toBe(LicenseTier.ENTERPRISE);
      expect(parseTier('REP-ABC12345-DEF67890')).toBe(LicenseTier.ENTERPRISE);
      expect(parseTier('RAAS-REP-ABC12345-DEF67890')).toBe(LicenseTier.ENTERPRISE);
    });

    it('should default to FREE for unknown key format', () => {
      expect(parseTier('')).toBe(LicenseTier.FREE);
      expect(parseTier('invalid-key')).toBe(LicenseTier.FREE);
      expect(parseTier('UNKNOWN-123')).toBe(LicenseTier.FREE);
    });

    it('should be case insensitive', () => {
      expect(parseTier('raas-pro-abc12345-def67890')).toBe(LicenseTier.PRO);
      expect(parseTier('RAAS-ENT-ABC12345-DEF67890')).toBe(LicenseTier.ENTERPRISE);
    });
  });

  describe('getTierLevel', () => {
    it('should return correct tier levels', () => {
      expect(tierLevel(LicenseTier.FREE)).toBe(0);
      expect(tierLevel(LicenseTier.STARTER)).toBe(1);
      expect(tierLevel(LicenseTier.PRO)).toBe(2);
      expect(tierLevel(LicenseTier.ENTERPRISE)).toBe(3);
      expect(tierLevel(LicenseTier.MASTER)).toBe(4);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should allow FREE features for FREE tier and deny PRO features', () => {
      expect(isFeature('basic_strategies', LicenseTier.FREE)).toBe(true);
      expect(isFeature('live_trading', LicenseTier.FREE)).toBe(true);
      expect(isFeature('basic_backtest', LicenseTier.FREE)).toBe(true);
      expect(isFeature('ml_strategies', LicenseTier.FREE)).toBe(false);
      expect(isFeature('premium_data', LicenseTier.FREE)).toBe(false);
      expect(isFeature('advanced_optimization', LicenseTier.FREE)).toBe(false);
    });

    it('should allow FREE and STARTER features for STARTER tier and deny PRO features', () => {
      expect(isFeature('basic_strategies', LicenseTier.STARTER)).toBe(true);
      expect(isFeature('live_trading', LicenseTier.STARTER)).toBe(true);
      expect(isFeature('tenant_management', LicenseTier.STARTER)).toBe(true);
      expect(isFeature('ml_strategies', LicenseTier.STARTER)).toBe(false);
      expect(isFeature('premium_data', LicenseTier.STARTER)).toBe(false);
      expect(isFeature('advanced_optimization', LicenseTier.STARTER)).toBe(false);
    });

    it('should allow PRO features for PRO tier and deny ENTERPRISE features', () => {
      expect(isFeature('ml_strategies', LicenseTier.PRO)).toBe(true);
      expect(isFeature('premium_data', LicenseTier.PRO)).toBe(true);
      expect(isFeature('hyperparameter_tuning', LicenseTier.PRO)).toBe(true);
      expect(isFeature('arbitrage_scanning', LicenseTier.PRO)).toBe(false);
      expect(isFeature('multi_exchange_trading', LicenseTier.PRO)).toBe(false);
      expect(isFeature('custom_strategies', LicenseTier.PRO)).toBe(false);
    });

    it('should allow all features for ENTERPRISE tier', () => {
      expect(isFeature('basic_strategies', LicenseTier.ENTERPRISE)).toBe(true);
      expect(isFeature('ml_strategies', LicenseTier.ENTERPRISE)).toBe(true);
      expect(isFeature('arbitrage_scanning', LicenseTier.ENTERPRISE)).toBe(true);
      expect(isFeature('priority_support', LicenseTier.ENTERPRISE)).toBe(true);
    });

    it('should return true for unknown features (no restriction)', () => {
      expect(isFeature('unknown_feature', LicenseTier.FREE)).toBe(true);
      expect(isFeature('custom_feature', LicenseTier.PRO)).toBe(true);
    });
  });

  describe('getRateLimits', () => {
    it('should return correct rate limits for each tier', () => {
      expect(rateLimits(LicenseTier.FREE)).toMatchObject({ requestsPerMin: 10, requestsPerHour: 100, burstPerSec: 2 });
      expect(rateLimits(LicenseTier.STARTER)).toMatchObject({ requestsPerMin: 50, requestsPerHour: 500, burstPerSec: 5 });
      expect(rateLimits(LicenseTier.PRO)).toMatchObject({ requestsPerMin: 100, requestsPerHour: 1000, burstPerSec: 10 });
      expect(rateLimits(LicenseTier.ENTERPRISE)).toMatchObject({ requestsPerMin: 1000, requestsPerHour: 10000, burstPerSec: 50 });
    });
  });

  describe('getDailyLimit & getOveragePrice', () => {
    it('should return correct daily limits and overage prices', () => {
      expect(dailyLimit(LicenseTier.FREE)).toBe(100);
      expect(dailyLimit(LicenseTier.STARTER)).toBe(5000);
      expect(dailyLimit(LicenseTier.PRO)).toBe(10000);
      expect(dailyLimit(LicenseTier.ENTERPRISE)).toBe(100000);

      expect(overagePrice(LicenseTier.FREE)).toBe(0);
      expect(overagePrice(LicenseTier.STARTER)).toBe(0);
      expect(overagePrice(LicenseTier.PRO)).toBe(0.01);
      expect(overagePrice(LicenseTier.ENTERPRISE)).toBe(0.005);
    });
  });
});
