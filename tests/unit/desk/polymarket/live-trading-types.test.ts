/**
 * Live Trading Types — unit tests
 * Target: 100% coverage for src/desk/polymarket/live-trading-types.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateLiveEnv, DEFAULT_RISK_LIMITS, type LiveTradingConfig, type RiskLimits, type OrchestratorStatus, type PaperTradeStats } from '../../../../src/desk/polymarket/live-trading-types';

describe('live-trading-types', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  describe('validateLiveEnv', () => {
    it('throws when all required env vars are missing', () => {
      delete process.env.POLYMARKET_API_KEY;
      delete process.env.POLY_API_KEY;
      delete process.env.POLYMARKET_API_SECRET;
      delete process.env.POLY_API_SECRET;
      delete process.env.POLYMARKET_PASSPHRASE;
      delete process.env.POLY_PASSPHRASE;
      delete process.env.POLYMARKET_ETH_ADDRESS;
      delete process.env.POLY_ETH_ADDRESS;

      expect(() => validateLiveEnv()).toThrow('LIVE mode requires all Polymarket API env vars');
      expect(() => validateLiveEnv()).toThrow('Polymarket API Key');
      expect(() => validateLiveEnv()).toThrow('Polymarket API Secret');
      expect(() => validateLiveEnv()).toThrow('Polymarket Passphrase');
      expect(() => validateLiveEnv()).toThrow('Polymarket ETH Address');
    });

    it('throws when POLYMARKET_API_KEY is missing but legacy exists', () => {
      process.env.POLY_API_KEY = 'legacy-key';
      delete process.env.POLYMARKET_API_KEY;
      delete process.env.POLYMARKET_API_SECRET;
      delete process.env.POLY_API_SECRET;
      delete process.env.POLYMARKET_PASSPHRASE;
      delete process.env.POLY_PASSPHRASE;
      delete process.env.POLYMARKET_ETH_ADDRESS;
      delete process.env.POLY_ETH_ADDRESS;

      expect(() => validateLiveEnv()).toThrow('Polymarket API Secret');
    });

    it('throws when POLYMARKET_API_SECRET is missing but legacy exists', () => {
      process.env.POLYMARKET_API_KEY = 'key';
      process.env.POLY_API_SECRET = 'legacy-secret';
      delete process.env.POLYMARKET_API_SECRET;
      delete process.env.POLYMARKET_PASSPHRASE;
      delete process.env.POLY_PASSPHRASE;
      delete process.env.POLYMARKET_ETH_ADDRESS;
      delete process.env.POLY_ETH_ADDRESS;

      expect(() => validateLiveEnv()).toThrow('Polymarket Passphrase');
    });

    it('throws when POLYMARKET_PASSPHRASE is missing but legacy exists', () => {
      process.env.POLYMARKET_API_KEY = 'key';
      process.env.POLYMARKET_API_SECRET = 'secret';
      process.env.POLY_PASSPHRASE = 'legacy-passphrase';
      delete process.env.POLYMARKET_PASSPHRASE;
      delete process.env.POLYMARKET_ETH_ADDRESS;
      delete process.env.POLY_ETH_ADDRESS;

      expect(() => validateLiveEnv()).toThrow('Polymarket ETH Address');
    });

    it('throws when POLYMARKET_ETH_ADDRESS is missing but legacy exists', () => {
      process.env.POLYMARKET_API_KEY = 'key';
      process.env.POLYMARKET_API_SECRET = 'secret';
      process.env.POLYMARKET_PASSPHRASE = 'passphrase';
      process.env.POLY_ETH_ADDRESS = '0xlegacy';
      delete process.env.POLYMARKET_ETH_ADDRESS;

      expect(() => validateLiveEnv()).not.toThrow();
    });

    it('does not throw when all new env vars are present', () => {
      process.env.POLYMARKET_API_KEY = 'key';
      process.env.POLYMARKET_API_SECRET = 'secret';
      process.env.POLYMARKET_PASSPHRASE = 'passphrase';
      process.env.POLYMARKET_ETH_ADDRESS = '0x123';

      expect(() => validateLiveEnv()).not.toThrow();
    });

    it('does not throw when all legacy env vars are present', () => {
      process.env.POLY_API_KEY = 'key';
      process.env.POLY_API_SECRET = 'secret';
      process.env.POLY_PASSPHRASE = 'passphrase';
      process.env.POLY_ETH_ADDRESS = '0x123';

      delete process.env.POLYMARKET_API_KEY;
      delete process.env.POLYMARKET_API_SECRET;
      delete process.env.POLYMARKET_PASSPHRASE;
      delete process.env.POLYMARKET_ETH_ADDRESS;

      expect(() => validateLiveEnv()).not.toThrow();
    });

    it('prefers new env vars over legacy when both present', () => {
      process.env.POLYMARKET_API_KEY = 'new-key';
      process.env.POLY_API_KEY = 'legacy-key';
      process.env.POLYMARKET_API_SECRET = 'new-secret';
      process.env.POLY_API_SECRET = 'legacy-secret';
      process.env.POLYMARKET_PASSPHRASE = 'new-passphrase';
      process.env.POLY_PASSPHRASE = 'legacy-passphrase';
      process.env.POLYMARKET_ETH_ADDRESS = '0xnew';
      process.env.POLY_ETH_ADDRESS = '0xlegacy';

      expect(() => validateLiveEnv()).not.toThrow();
    });

    it('throws with empty string values', () => {
      process.env.POLYMARKET_API_KEY = '';
      process.env.POLYMARKET_API_SECRET = '';
      process.env.POLYMARKET_PASSPHRASE = '';
      process.env.POLYMARKET_ETH_ADDRESS = '';

      expect(() => validateLiveEnv()).toThrow('Polymarket API Key');
      expect(() => validateLiveEnv()).toThrow('Polymarket API Secret');
      expect(() => validateLiveEnv()).toThrow('Polymarket Passphrase');
      expect(() => validateLiveEnv()).toThrow('Polymarket ETH Address');
    });

    it('error message includes all missing vars in correct format', () => {
      delete process.env.POLYMARKET_API_KEY;
      delete process.env.POLY_API_KEY;
      delete process.env.POLYMARKET_API_SECRET;
      delete process.env.POLY_API_SECRET;
      delete process.env.POLYMARKET_PASSPHRASE;
      delete process.env.POLY_PASSPHRASE;
      delete process.env.POLYMARKET_ETH_ADDRESS;
      delete process.env.POLY_ETH_ADDRESS;

      try {
        validateLiveEnv();
      } catch (e: any) {
        expect(e.message).toContain('LIVE mode requires all Polymarket API env vars');
        expect(e.message).toContain('Polymarket API Key (POLYMARKET_API_KEY or POLY_API_KEY)');
        expect(e.message).toContain('Polymarket API Secret (POLYMARKET_API_SECRET or POLY_API_SECRET)');
        expect(e.message).toContain('Polymarket Passphrase (POLYMARKET_PASSPHRASE or POLY_PASSPHRASE)');
        expect(e.message).toContain('Polymarket ETH Address (POLYMARKET_ETH_ADDRESS or POLY_ETH_ADDRESS)');
        expect(e.message).toContain('Set them in your .env or use PAPER_MODE=true for paper trading.');
      }
    });
  });

  describe('DEFAULT_RISK_LIMITS', () => {
    it('has correct default values', () => {
      expect(DEFAULT_RISK_LIMITS.maxAllocationPct).toBe(0.25);
      expect(DEFAULT_RISK_LIMITS.maxPositionUsdc).toBe(500);
      expect(DEFAULT_RISK_LIMITS.maxDailyLossUsdc).toBe(100);
      expect(DEFAULT_RISK_LIMITS.maxDrawdownPct).toBe(0.1);
      expect(DEFAULT_RISK_LIMITS.tradeCooldownMs).toBe(30_000);
    });

    it('matches RiskLimits interface', () => {
      const limits: RiskLimits = DEFAULT_RISK_LIMITS;
      expect(limits.maxAllocationPct).toBeDefined();
      expect(limits.maxPositionUsdc).toBeDefined();
      expect(limits.maxDailyLossUsdc).toBeDefined();
      expect(limits.maxDrawdownPct).toBeDefined();
      expect(limits.tradeCooldownMs).toBeDefined();
    });
  });

  describe('LiveTradingConfig interface', () => {
    it('accepts valid config with all optional fields', () => {
      const config: LiveTradingConfig = {
        paperTrading: true,
        capitalUsdc: 10000,
        maxPositionFraction: 0.02,
        maxDailyDrawdown: 0.05,
        maxConcurrentPositions: 10,
        maxConsecutiveLosses: 3,
        chainId: 137,
        apiUrl: 'https://api.polymarket.com',
      };
      expect(config.capitalUsdc).toBe(10000);
      expect(config.paperTrading).toBe(true);
      expect(config.maxPositionFraction).toBe(0.02);
      expect(config.maxDailyDrawdown).toBe(0.05);
      expect(config.maxConcurrentPositions).toBe(10);
      expect(config.maxConsecutiveLosses).toBe(3);
      expect(config.chainId).toBe(137);
      expect(config.apiUrl).toBe('https://api.polymarket.com');
    });

    it('accepts minimal config with only required capitalUsdc', () => {
      const config: LiveTradingConfig = {
        capitalUsdc: 5000,
      };
      expect(config.capitalUsdc).toBe(5000);
      expect(config.paperTrading).toBeUndefined();
    });
  });

  describe('RiskLimits interface', () => {
    it('accepts all required fields', () => {
      const limits: RiskLimits = {
        maxAllocationPct: 0.3,
        maxPositionUsdc: 1000,
        maxDailyLossUsdc: 200,
        maxDrawdownPct: 0.15,
        tradeCooldownMs: 60_000,
      };
      expect(limits.maxAllocationPct).toBe(0.3);
      expect(limits.maxPositionUsdc).toBe(1000);
      expect(limits.maxDailyLossUsdc).toBe(200);
      expect(limits.maxDrawdownPct).toBe(0.15);
      expect(limits.tradeCooldownMs).toBe(60_000);
    });
  });

  describe('OrchestratorStatus type', () => {
    it('allows all valid statuses', () => {
      const statuses: OrchestratorStatus[] = ['stopped', 'starting', 'running', 'stopping', 'error'];
      statuses.forEach(s => {
        const status: OrchestratorStatus = s;
        expect(status).toBe(s);
      });
    });
  });

  describe('PaperTradeStats interface', () => {
    it('accepts valid paper trade stats', () => {
      const stats: PaperTradeStats = {
        paperTrades: 42,
        paperPnl: 123.45,
      };
      expect(stats.paperTrades).toBe(42);
      expect(stats.paperPnl).toBe(123.45);
    });
  });
});