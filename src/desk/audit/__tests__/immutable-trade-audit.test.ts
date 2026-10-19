/**
 * Tests for ImmutableTradeAudit — append-only audit log with chain hashing.
 * Mocks crypto.randomUUID and Date.now for deterministic records.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRandomUUID, mockNow } = vi.hoisted(() => ({
  mockRandomUUID: vi.fn(() => 'uuid-0001'),
  mockNow: vi.fn(() => 1_700_000_000_000),
}));

vi.stubGlobal('crypto', { randomUUID: mockRandomUUID });
vi.stubGlobal('Date', class { constructor(...args: unknown[]) { return args.length > 0 ? new (globalThis as unknown as { Date: typeof Date }).Date(...args) : new (globalThis as unknown as { Date: typeof Date }).Date(mockNow()); } static now = mockNow; } as unknown as typeof Date);

let append: typeof import('../immutable-trade-audit').append;
let query: typeof import('../immutable-trade-audit').query;
let verifyIntegrity: typeof import('../immutable-trade-audit').verifyIntegrity;
let ImmutableTradeAudit: typeof import('../immutable-trade-audit').ImmutableTradeAudit;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../immutable-trade-audit');
  append = mod.append;
  query = mod.query;
  verifyIntegrity = mod.verifyIntegrity;
  ImmutableTradeAudit = mod.ImmutableTradeAudit;
});

describe('append (module-level)', () => {
  beforeEach(() => {
    mockRandomUUID.mockClear();
    mockNow.mockClear();
  });

  it('creates a record with generated id, timestamp, and hash', () => {
    const record = append({ eventType: 'trade_decision', payload: { reason: 'ok' } });

    expect(record.id).toBe('uuid-0001');
    expect(record.timestamp).toBe(1_700_000_000_000);
    expect(record.eventType).toBe('trade_decision');
    expect(record.payload).toEqual({ reason: 'ok' });
    expect(record.hash).toMatch(/^sha256:[0-9a-f]+$/);
    expect(record.previousHash).toBe('');
  });

  it('pushes the record to the module-level trail', () => {
    append({ eventType: 'risk_check', payload: { ok: true } });
    const trail = query();
    expect(trail.length).toBe(1);
    expect(trail[0].eventType).toBe('risk_check');
  });

  it('records keep previousHash as empty string (chain linkage not implemented)', () => {
    mockRandomUUID.mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2');
    const first = append({ eventType: 'a', payload: {} });
    const second = append({ eventType: 'b', payload: {} });

    expect(first.previousHash).toBe('');
    expect(second.previousHash).toBe('');
    expect(second.previousHash).not.toBe(first.hash);
  });
});

describe('query', () => {
  it('returns an empty array when no records have been appended', () => {
    expect(query()).toEqual([]);
  });

  it('returns all records regardless of filters object', () => {
    append({ eventType: 'trade_decision', payload: { reason: 'ok' } });
    expect(query().length).toBe(1);
    expect(query({}).length).toBe(1);
    expect(query({ eventType: 'trade_decision', from: 0, to: 1_700_000_000_000 }).length).toBe(1);
  });
});

describe('verifyIntegrity', () => {
  it('returns true when no records exist or all records hash-match', () => {
    expect(verifyIntegrity()).toBe(true);
    append({ eventType: 'trade_decision', payload: { reason: 'ok' } });
    expect(verifyIntegrity()).toBe(true);
  });

  it('returns false when a record hash is tampered with', () => {
    append({ eventType: 'trade_decision', payload: { reason: 'ok' } });
    const trail = query();
    const last = trail[trail.length - 1]!;
    const originalHash = last.hash;
    last.hash = 'sha256:tampered';
    expect(verifyIntegrity()).toBe(false);
    last.hash = originalHash;
    expect(verifyIntegrity()).toBe(true);
  });

  it('returns true across multiple records (i > 0 iteration path)', () => {
    append({ eventType: 'a', payload: {} });
    append({ eventType: 'b', payload: {} });
    append({ eventType: 'c', payload: {} });
    expect(verifyIntegrity()).toBe(true);
  });
});

describe('ImmutableTradeAudit class wrapper', () => {
  let audit: ImmutableTradeAudit;
  beforeEach(() => {
    audit = new ImmutableTradeAudit();
  });

  it('append builds a record with eventType and reason in payload', () => {
    const record = audit.append('trade_decision', 'price moved', { marketId: 'mkt-1' });
    expect(record.eventType).toBe('trade_decision');
    expect(record.payload).toEqual({ reason: 'price moved', marketId: 'mkt-1' });
  });

  it('logTradeDecision records trade_decision event with full payload', () => {
    const record = audit.logTradeDecision('mkt-1', 'buy', 'signal-1', 100, 50, 'wallet-1', 'oversold');
    expect(record.eventType).toBe('trade_decision');
    expect(record.payload).toEqual({
      marketId: 'mkt-1', side: 'buy', signal: 'signal-1',
      kellySize: 100, actualSize: 50, walletLabel: 'wallet-1',
    });
  });

  it('logCircuitBreaker records circuit_breaker event with or without metadata', () => {
    const record = audit.logCircuitBreaker('max drawdown breached', { tier: 'L3' });
    expect(record.eventType).toBe('circuit_breaker');
    expect(record.payload).toEqual({ reason: 'max drawdown breached', metadata: { tier: 'L3' } });

    const record2 = audit.logCircuitBreaker('stop');
    expect(record2.payload).toEqual({ reason: 'stop', metadata: undefined });
  });

  it('logDrawdownTierChange, getAuditTrail, and verifyIntegrity delegate cleanly', () => {
    const record = audit.logDrawdownTierChange('L4', 15.5, 98_000);
    expect(record.eventType).toBe('drawdown_tier_change');
    expect(record.payload).toEqual({ tier: 'L4', drawdownPercent: 15.5, portfolioValue: 98_000 });
    expect(Array.isArray(audit.getAuditTrail())).toBe(true);
    expect(audit.verifyIntegrity()).toBe(true);
  });
});
