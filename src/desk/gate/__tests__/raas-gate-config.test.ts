/**
 * RaaS Gate Configuration Tests
 * Static configuration tests for tier features and feature-to-tier mappings.
 */

import { describe, it, expect } from 'vitest';
import { TIER_CONFIG, FEATURE_TIER_MAP } from '../raas-gate';
import { LicenseTier } from '../../../shared/types/license';

describe('raas-gate config', () => {
  describe('TIER_CONFIG', () => {
    it('should have correct features for FREE tier', () => {
      const features = TIER_CONFIG[LicenseTier.FREE].features;
      expect(features).toContain('basic_strategies');
      expect(features).toContain('live_trading');
      expect(features).toContain('basic_backtest');
    });

    it('should have correct features for STARTER tier', () => {
      const features = TIER_CONFIG[LicenseTier.STARTER].features;
      expect(features).toContain('basic_strategies');
      expect(features).toContain('live_trading');
      expect(features).toContain('tenant_management');
    });

    it('should have correct features for PRO tier', () => {
      const features = TIER_CONFIG[LicenseTier.PRO].features;
      expect(features).toContain('ml_strategies');
      expect(features).toContain('premium_data');
      expect(features).toContain('advanced_optimization');
    });

    it('should have correct features for ENTERPRISE tier', () => {
      const features = TIER_CONFIG[LicenseTier.ENTERPRISE].features;
      expect(features).toContain('all_pro_features');
      expect(features).toContain('arbitrage_scanning');
      expect(features).toContain('multi_exchange_trading');
    });
  });

  describe('FEATURE_TIER_MAP', () => {
    it('should map all FREE features correctly', () => {
      expect(FEATURE_TIER_MAP['basic_strategies']).toBe(LicenseTier.FREE);
      expect(FEATURE_TIER_MAP['live_trading']).toBe(LicenseTier.FREE);
      expect(FEATURE_TIER_MAP['basic_backtest']).toBe(LicenseTier.FREE);
    });

    it('should map all STARTER features correctly', () => {
      expect(FEATURE_TIER_MAP['tenant_management']).toBe(LicenseTier.STARTER);
    });

    it('should map all PRO features correctly', () => {
      expect(FEATURE_TIER_MAP['ml_strategies']).toBe(LicenseTier.PRO);
      expect(FEATURE_TIER_MAP['premium_data']).toBe(LicenseTier.PRO);
    });

    it('should map all ENTERPRISE features correctly', () => {
      expect(FEATURE_TIER_MAP['arbitrage_scanning']).toBe(LicenseTier.ENTERPRISE);
      expect(FEATURE_TIER_MAP['multi_exchange_trading']).toBe(LicenseTier.ENTERPRISE);
      expect(FEATURE_TIER_MAP['priority_support']).toBe(LicenseTier.ENTERPRISE);
    });
  });
});
