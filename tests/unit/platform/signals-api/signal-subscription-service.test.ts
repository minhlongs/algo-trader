/**
 * Tests for SignalSubscriptionService
 * Covers: create (valid/invalid webhook/duplicate tenant), get, list (all/filtered),
 *         cancel (found/not found), isValidWebhookUrl (https/localhost/http/bad),
 *         getRateLimit, getActiveForTenant
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SignalSubscriptionService, TIER_RATE_LIMITS } from '../../../../src/platform/signals-api/signal-subscription-service';
import type { TierLabel } from '../../../../src/platform/signals-api/signal-subscription-service';

describe('SignalSubscriptionService', () => {
  let service: SignalSubscriptionService;

  beforeEach(() => {
    service = new SignalSubscriptionService();
  });

  // ── TIER_RATE_LIMITS constant ──

  describe('TIER_RATE_LIMITS', () => {
    it('has correct limits for all tiers', () => {
      expect(TIER_RATE_LIMITS.FREE).toBe(2);
      expect(TIER_RATE_LIMITS.STARTER).toBe(10);
      expect(TIER_RATE_LIMITS.PRO).toBe(30);
      expect(TIER_RATE_LIMITS.ENTERPRISE).toBe(120);
      expect(TIER_RATE_LIMITS.MASTER).toBe(-1);
    });
  });

  // ── create ──

  describe('create', () => {
    it('creates a subscription with valid https webhook', () => {
      const sub = service.create({
        tenantId: 't1',
        tier: 'PRO',
        webhookUrl: 'https://hooks.example.com/notify',
      });

      expect(sub.tenantId).toBe('t1');
      expect(sub.tier).toBe('PRO');
      expect(sub.status).toBe('active');
      expect(sub.webhookUrl).toBe('https://hooks.example.com/notify');
      expect(sub.id).toBeDefined();
      expect(sub.chatId).toBeNull();
      expect(sub.expiresAt).toBeNull();
    });

    it('creates a subscription without webhook (defaults to null)', () => {
      const sub = service.create({ tenantId: 't2', tier: 'FREE' });

      expect(sub.webhookUrl).toBeNull();
    });

    it('creates a subscription with expiresAt', () => {
      const exp = new Date('2026-12-31');
      const sub = service.create({ tenantId: 't3', tier: 'ENTERPRISE', expiresAt: exp });

      expect(sub.expiresAt).toEqual(exp);
    });

    it('throws on invalid webhook URL', () => {
      expect(() =>
        service.create({ tenantId: 't4', tier: 'PRO', webhookUrl: 'not-a-url' }),
      ).toThrow('Invalid webhook URL');
    });

    it('throws on http webhook URL (non-localhost)', () => {
      expect(() =>
        service.create({ tenantId: 't5', tier: 'PRO', webhookUrl: 'http://example.com/hook' }),
      ).toThrow('Invalid webhook URL');
    });

    it('allows http webhook URL for localhost', () => {
      const sub = service.create({
        tenantId: 't6',
        tier: 'FREE',
        webhookUrl: 'http://localhost:3000/webhook',
      });
      expect(sub.webhookUrl).toBe('http://localhost:3000/webhook');
    });

    it('allows http webhook URL for 127.0.0.1', () => {
      const sub = service.create({
        tenantId: 't7',
        tier: 'FREE',
        webhookUrl: 'http://127.0.0.1:8080/hook',
      });
      expect(sub.webhookUrl).toBe('http://127.0.0.1:8080/hook');
    });

    it('allows https for non-localhost', () => {
      const sub = service.create({
        tenantId: 't8',
        tier: 'STARTER',
        webhookUrl: 'https://myapp.io/alerts',
      });
      expect(sub.webhookUrl).toBe('https://myapp.io/alerts');
    });

    it('throws on duplicate active subscription for same tenant', () => {
      service.create({ tenantId: 't9', tier: 'FREE' });
      expect(() =>
        service.create({ tenantId: 't9', tier: 'PRO' }),
      ).toThrow('already has an active subscription');
    });

    it('allows re-creating after cancellation', () => {
      const first = service.create({ tenantId: 't10', tier: 'FREE' });
      service.cancel(first.id);
      const second = service.create({ tenantId: 't10', tier: 'PRO' });
      expect(second.tier).toBe('PRO');
      expect(second.id).not.toBe(first.id);
    });
  });

  // ── get ──

  describe('get', () => {
    it('returns subscription by id', () => {
      const sub = service.create({ tenantId: 't1', tier: 'FREE' });
      expect(service.get(sub.id)).toBe(sub);
    });

    it('returns undefined for unknown id', () => {
      expect(service.get('nonexistent')).toBeUndefined();
    });
  });

  // ── list ──

  describe('list', () => {
    it('returns all subscriptions when no filter', () => {
      service.create({ tenantId: 't1', tier: 'FREE' });
      service.create({ tenantId: 't2', tier: 'PRO' });
      expect(service.list()).toHaveLength(2);
    });

    it('filters by tenantId', () => {
      service.create({ tenantId: 't1', tier: 'FREE' });
      service.create({ tenantId: 't2', tier: 'PRO' });
      expect(service.list('t1')).toHaveLength(1);
      expect(service.list('t1')[0].tenantId).toBe('t1');
    });

    it('returns empty array when tenantId matches none', () => {
      expect(service.list('nobody')).toHaveLength(0);
    });
  });

  // ── cancel ──

  describe('cancel', () => {
    it('cancels an existing subscription', () => {
      const sub = service.create({ tenantId: 't1', tier: 'FREE' });
      expect(service.cancel(sub.id)).toBe(true);
      expect(service.get(sub.id)?.status).toBe('cancelled');
    });

    it('returns false for unknown id', () => {
      expect(service.cancel('nonexistent')).toBe(false);
    });
  });

  // ── getRateLimit ──

  describe('getRateLimit', () => {
    it('returns correct limit for each tier', () => {
      expect(service.getRateLimit('FREE')).toBe(2);
      expect(service.getRateLimit('STARTER')).toBe(10);
      expect(service.getRateLimit('PRO')).toBe(30);
      expect(service.getRateLimit('ENTERPRISE')).toBe(120);
      expect(service.getRateLimit('MASTER')).toBe(-1);
    });

    it('returns 0 for unknown tier', () => {
      expect(service.getRateLimit('UNKNOWN' as TierLabel)).toBe(0);
    });
  });

  // ── getActiveForTenant ──

  describe('getActiveForTenant', () => {
    it('returns only active subscriptions for tenant', () => {
      const sub1 = service.create({ tenantId: 't1', tier: 'FREE' });
      service.create({ tenantId: 't2', tier: 'PRO' });
      service.cancel(sub1.id);

      const active = service.getActiveForTenant('t1');
      expect(active).toHaveLength(0);
    });

    it('returns empty array when no active subscriptions', () => {
      expect(service.getActiveForTenant('nobody')).toHaveLength(0);
    });

    it('returns only one active subscription per tenant (second create throws)', () => {
      service.create({ tenantId: 't1', tier: 'FREE' });
      expect(() => service.create({ tenantId: 't1', tier: 'PRO' })).toThrow('already has an active subscription');

      const active = service.getActiveForTenant('t1');
      expect(active).toHaveLength(1);
      expect(active[0].tier).toBe('FREE');
    });
  });
});
