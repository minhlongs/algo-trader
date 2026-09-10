/**
 * RiskCalculationRepository Tests
 * Covers constructor (default/custom TTL), fromCache (hit/miss/empty/parse-error),
 * saveCache (success/failure-swallowed), and #buildKey (defaults + overrides).
 * Injects a fake redis client — no live Redis.
 */

import { describe, it, expect, vi } from 'vitest';
import { RiskCalculationRepository } from '../repository';
import type { RiskCalculationResult } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RESULT: RiskCalculationResult = {
  id: 'r1',
  riskScore: 42,
  level: 'medium',
  symbol: 'BTC-USD',
  calculatedAt: '2026-01-01T00:00:00Z',
  confidence: 0.8,
  factors: ['vol'],
  triggeredBy: 'test',
  algorithm: 'var',
};

function makeRepo(overrides: Partial<{ get: any; setex: any; ttl?: number }> = {}) {
  const get = overrides.get ?? vi.fn();
  const setex = overrides.setex ?? vi.fn();
  const redis = { get, setex };
  return new RiskCalculationRepository({
    redis,
    ttlSeconds: overrides.ttl,
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('RiskCalculationRepository', () => {
  // ─── constructor / TTL ─────────────────────────────────────────────────────

  describe('constructor', () => {
    it('uses default TTL of 60 seconds when not specified', () => {
      const setex = vi.fn().mockResolvedValue(undefined);
      const repo = makeRepo({ setex });
      // exercise saveCache so setex is called with the TTL
      return repo.saveCache({ limit: 100 }, [RESULT]).then(() => {
        expect(setex).toHaveBeenCalledWith(
          expect.any(String),
          60,
          expect.any(String),
        );
      });
    });

    it('uses custom TTL when provided', () => {
      const setex = vi.fn().mockResolvedValue(undefined);
      const repo = makeRepo({ setex, ttl: 120 });
      return repo.saveCache({ limit: 100 }, [RESULT]).then(() => {
        expect(setex).toHaveBeenCalledWith(
          expect.any(String),
          120,
          expect.any(String),
        );
      });
    });
  });

  // ─── fromCache ─────────────────────────────────────────────────────────────

  describe('fromCache', () => {
    it('returns parsed array on cache hit', async () => {
      const get = vi.fn().mockResolvedValue(JSON.stringify([RESULT]));
      const repo = makeRepo({ get });
      const result = await repo.fromCache({ limit: 100 });
      expect(result).toEqual([RESULT]);
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('returns null on cache miss (raw is null)', async () => {
      const get = vi.fn().mockResolvedValue(null);
      const repo = makeRepo({ get });
      const result = await repo.fromCache({ limit: 100 });
      expect(result).toBeNull();
    });

    it('returns null when parsed value is not an array', async () => {
      const get = vi.fn().mockResolvedValue(JSON.stringify({ not: 'array' }));
      const repo = makeRepo({ get });
      const result = await repo.fromCache({ limit: 100 });
      expect(result).toBeNull();
    });

    it('returns null when parsed array is empty', async () => {
      const get = vi.fn().mockResolvedValue(JSON.stringify([]));
      const repo = makeRepo({ get });
      const result = await repo.fromCache({ limit: 100 });
      expect(result).toBeNull();
    });

    it('returns null when JSON parse throws (corrupt entry)', async () => {
      const get = vi.fn().mockResolvedValue('not-valid-json{');
      const repo = makeRepo({ get });
      const result = await repo.fromCache({ limit: 100 });
      expect(result).toBeNull();
    });

    it('returns null when redis.get throws', async () => {
      const get = vi.fn().mockRejectedValue(new Error('redis down'));
      const repo = makeRepo({ get });
      const result = await repo.fromCache({ limit: 100 });
      expect(result).toBeNull();
    });
  });

  // ─── saveCache ─────────────────────────────────────────────────────────────

  describe('saveCache', () => {
    it('writes JSON payload via setex with the configured TTL', async () => {
      const setex = vi.fn().mockResolvedValue(undefined);
      const repo = makeRepo({ setex, ttl: 30 });
      await repo.saveCache({ limit: 500 }, [RESULT]);
      expect(setex).toHaveBeenCalledTimes(1);
      const [key, ttl, payload] = setex.mock.calls[0]!;
      expect(ttl).toBe(30);
      const parsed = JSON.parse(payload);
      expect(parsed).toEqual([RESULT]);
      expect(key).toContain('risk:calc');
    });

    it('detaches from readonly input (stringifies a copy)', async () => {
      const setex = vi.fn().mockResolvedValue(undefined);
      const repo = makeRepo({ setex });
      const input: readonly RiskCalculationResult[] = [RESULT];
      await repo.saveCache({ limit: 100 }, input);
      const [, , payload] = setex.mock.calls[0]!;
      expect(JSON.parse(payload)).toEqual([RESULT]);
    });

    it('swallows setex failure — does not throw', async () => {
      const setex = vi.fn().mockRejectedValue(new Error('redis unavailable'));
      const repo = makeRepo({ setex });
      await expect(repo.saveCache({ limit: 100 }, [RESULT])).resolves.not.toThrow();
    });
  });

  // ─── #buildKey ─────────────────────────────────────────────────────────────

  describe('key building', () => {
    it('uses defaults (sort=desc, riskLevel=low) when params omitted', async () => {
      const get = vi.fn().mockResolvedValue(null);
      const repo = makeRepo({ get });
      await repo.fromCache({ limit: 100 });
      const [key] = get.mock.calls[0]!;
      expect(key).toBe('risk:calc:100:desc:low');
    });

    it('encodes explicit sort and riskLevel', async () => {
      const get = vi.fn().mockResolvedValue(null);
      const repo = makeRepo({ get });
      await repo.fromCache({ limit: 250, sort: 'asc', riskLevel: 'high' });
      const [key] = get.mock.calls[0]!;
      expect(key).toBe('risk:calc:250:asc:high');
    });

    it('encodes riskLevel only (sort falls back to desc)', async () => {
      const get = vi.fn().mockResolvedValue(null);
      const repo = makeRepo({ get });
      await repo.fromCache({ limit: 100, riskLevel: 'medium' });
      const [key] = get.mock.calls[0]!;
      expect(key).toBe('risk:calc:100:desc:medium');
    });

    it('encodes sort only (riskLevel falls back to low)', async () => {
      const get = vi.fn().mockResolvedValue(null);
      const repo = makeRepo({ get });
      await repo.fromCache({ limit: 100, sort: 'asc' });
      const [key] = get.mock.calls[0]!;
      expect(key).toBe('risk:calc:100:asc:low');
    });

    it('produces different keys for different params (cache isolation)', async () => {
      const get = vi.fn().mockResolvedValue(null);
      const repo = makeRepo({ get });
      await repo.fromCache({ limit: 100 });
      await repo.fromCache({ limit: 200 });
      expect(get.mock.calls[0]![0]).not.toBe(get.mock.calls[1]![0]);
    });
  });
});