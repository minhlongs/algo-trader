/**
 * Tests for marketplace-strategy-helpers — Zod schemas + identity helpers.
 *
 * Covers: publishBodySchema, updateStrategySchema, strategyFilterSchema,
 * getTenantId, getUserId, isAdmin.
 */

import { describe, it, expect } from 'vitest';
import {
  publishBodySchema,
  updateStrategySchema,
  strategyFilterSchema,
  getTenantId,
  getUserId,
  isAdmin,
  getQueryString,
  getQueryNumber,
} from '../../../../../src/platform/api/routes/marketplace-strategy-helpers';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(overrides: Record<string, unknown> = {}): any {
  return {
    tenant: overrides.tenant,
    user: overrides.user,
    apiKey: overrides.apiKey,
  };
}

const VALID_PUBLISH_BODY = {
  name: 'My Strategy',
  description: 'A'.repeat(50),
  category: 'arbitrage',
  riskLevel: 5,
  minAllocationUsd: 1000,
  maxAllocationUsd: 10000,
};

// ── publishBodySchema ────────────────────────────────────────────────────────

describe('publishBodySchema', () => {
  it('accepts a valid body', () => {
    const result = publishBodySchema.safeParse(VALID_PUBLISH_BODY);
    expect(result.success).toBe(true);
  });

  it('rejects name shorter than 3 chars', () => {
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, name: 'ab' });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 255 chars', () => {
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, name: 'a'.repeat(256) });
    expect(result.success).toBe(false);
  });

  it('rejects description shorter than 50 chars', () => {
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, description: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects description longer than 2000 chars', () => {
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, description: 'a'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category', () => {
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, category: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid categories', () => {
    for (const cat of ['arbitrage', 'momentum', 'mean-reversion', 'statistical', 'portfolio', 'risk', 'hedging', 'other']) {
      const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, category: cat });
      expect(result.success).toBe(true);
    }
  });

  it('rejects riskLevel below 1', () => {
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, riskLevel: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects riskLevel above 10', () => {
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, riskLevel: 11 });
    expect(result.success).toBe(false);
  });

  it('rejects minAllocationUsd below 100', () => {
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, minAllocationUsd: 50 });
    expect(result.success).toBe(false);
  });

  it('rejects maxAllocationUsd above 10000000', () => {
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, maxAllocationUsd: 20000000 });
    expect(result.success).toBe(false);
  });

  it('accepts optional supportedExchanges', () => {
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, supportedExchanges: ['binance', 'kraken'] });
    expect(result.success).toBe(true);
  });

  it('accepts optional tags within max 10', () => {
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, tags: ['a', 'b', 'c'] });
    expect(result.success).toBe(true);
  });

  it('rejects tags exceeding max 10', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    const result = publishBodySchema.safeParse({ ...VALID_PUBLISH_BODY, tags });
    expect(result.success).toBe(false);
  });

  it('accepts optional backtestSummary', () => {
    const result = publishBodySchema.safeParse({
      ...VALID_PUBLISH_BODY,
      backtestSummary: { sharpe: 1.5, maxDrawdown: 0.2, winRate: 60, periodDays: 90 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects backtestSummary with winRate above 100', () => {
    const result = publishBodySchema.safeParse({
      ...VALID_PUBLISH_BODY,
      backtestSummary: { sharpe: 1.5, maxDrawdown: 0.2, winRate: 101, periodDays: 90 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects backtestSummary with periodDays below 30', () => {
    const result = publishBodySchema.safeParse({
      ...VALID_PUBLISH_BODY,
      backtestSummary: { sharpe: 1.5, maxDrawdown: 0.2, winRate: 60, periodDays: 10 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = publishBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── updateStrategySchema ─────────────────────────────────────────────────────

describe('updateStrategySchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = updateStrategySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial update with name only', () => {
    const result = updateStrategySchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts partial update with description only', () => {
    const result = updateStrategySchema.safeParse({ description: 'A'.repeat(50) });
    expect(result.success).toBe(true);
  });

  it('accepts partial update with tags only', () => {
    const result = updateStrategySchema.safeParse({ tags: ['updated'] });
    expect(result.success).toBe(true);
  });

  it('rejects name shorter than 3 chars', () => {
    const result = updateStrategySchema.safeParse({ name: 'ab' });
    expect(result.success).toBe(false);
  });

  it('rejects description shorter than 50 chars', () => {
    const result = updateStrategySchema.safeParse({ description: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects tags exceeding max 10', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    const result = updateStrategySchema.safeParse({ tags });
    expect(result.success).toBe(false);
  });
});

// ── strategyFilterSchema ─────────────────────────────────────────────────────

describe('strategyFilterSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = strategyFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts all valid fields', () => {
    const result = strategyFilterSchema.safeParse({
      category: 'arbitrage',
      riskLevel: 5,
      minSharpe: 1.0,
      maxDrawdown: 0.3,
      status: 'approved',
      page: 1,
      limit: 20,
    });
    expect(result.success).toBe(true);
  });

  it('rejects riskLevel below 1', () => {
    const result = strategyFilterSchema.safeParse({ riskLevel: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects riskLevel above 10', () => {
    const result = strategyFilterSchema.safeParse({ riskLevel: 11 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status enum', () => {
    const result = strategyFilterSchema.safeParse({ status: 'bogus' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid status values', () => {
    for (const s of ['approved', 'suspended']) {
      const result = strategyFilterSchema.safeParse({ status: s });
      expect(result.success).toBe(true);
    }
  });

  it('rejects page below 1', () => {
    const result = strategyFilterSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects limit above 100', () => {
    const result = strategyFilterSchema.safeParse({ limit: 200 });
    expect(result.success).toBe(false);
  });
});

// ── getTenantId ──────────────────────────────────────────────────────────────

describe('getTenantId', () => {
  it('returns tenant.id when present', () => {
    expect(getTenantId(makeReq({ tenant: { id: 't-1' } }))).toBe('t-1');
  });

  it('falls back to user.tenantId when tenant is missing', () => {
    expect(getTenantId(makeReq({ user: { id: 'u1', tenantId: 't-2' } }))).toBe('t-2');
  });

  it('throws when no tenant context is present', () => {
    expect(() => getTenantId(makeReq())).toThrow('Unauthorized: No tenant context');
  });
});

// ── getUserId ────────────────────────────────────────────────────────────────

describe('getUserId', () => {
  it('returns user.id when present', () => {
    expect(getUserId(makeReq({ user: { id: 'u1' } }))).toBe('u1');
  });

  it('falls back to apiKey.userId when user is missing', () => {
    expect(getUserId(makeReq({ apiKey: { userId: 'u2' } }))).toBe('u2');
  });

  it('throws when no user context is present', () => {
    expect(() => getUserId(makeReq())).toThrow('Unauthorized: No user context');
  });
});

// ── isAdmin ──────────────────────────────────────────────────────────────────

describe('isAdmin', () => {
  it('returns true when apiKey.isAdmin is true', () => {
    expect(isAdmin(makeReq({ apiKey: { isAdmin: true } }))).toBe(true);
  });

  it('returns true when user.role is admin', () => {
    expect(isAdmin(makeReq({ user: { id: 'u1', role: 'admin' } }))).toBe(true);
  });

  it('returns false when role is not admin', () => {
    expect(isAdmin(makeReq({ user: { id: 'u1', role: 'user' } }))).toBe(false);
  });

  it('returns false when nothing present', () => {
    expect(isAdmin(makeReq())).toBe(false);
  });
});

// ── getQueryString ───────────────────────────────────────────────────────────

describe('getQueryString', () => {
  it('returns default when value is undefined', () => {
    expect(getQueryString(undefined)).toBe('');
  });

  it('returns default when value is null', () => {
    expect(getQueryString(null, 'fallback')).toBe('fallback');
  });

  it('returns first element when value is an array', () => {
    expect(getQueryString(['a', 'b'])).toBe('a');
  });

  it('stringifies non-string array element', () => {
    expect(getQueryString([42])).toBe('42');
  });

  it('returns string directly', () => {
    expect(getQueryString('hello')).toBe('hello');
  });

  it('stringifies non-string non-array value', () => {
    expect(getQueryString(123)).toBe('123');
  });
});

// ── getQueryNumber ───────────────────────────────────────────────────────────

describe('getQueryNumber', () => {
  it('returns default when value is undefined', () => {
    expect(getQueryNumber(undefined)).toBe(0);
  });

  it('returns default when value is null', () => {
    expect(getQueryNumber(null, 5)).toBe(5);
  });

  it('parses first array element as string', () => {
    expect(getQueryNumber(['10'])).toBe(10);
  });

  it('returns first array element when it is a number', () => {
    expect(getQueryNumber([7])).toBe(7);
  });

  it('returns default for non-numeric array element', () => {
    expect(getQueryNumber(['abc'], 3)).toBe(3);
  });

  it('returns default for empty array element', () => {
    expect(getQueryNumber([], 3)).toBe(3);
  });

  it('parses numeric string', () => {
    expect(getQueryNumber('42')).toBe(42);
  });

  it('returns default for non-numeric string', () => {
    expect(getQueryNumber('xyz', 2)).toBe(2);
  });

  it('returns number directly', () => {
    expect(getQueryNumber(99)).toBe(99);
  });

  it('returns default for other types', () => {
    expect(getQueryNumber({}, 8)).toBe(8);
  });
});
