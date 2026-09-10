/**
 * Tests for cookie-attribution — affiliate cookie hashing + attribution
 * persistence. Covers generateCookieHash, resolveExpiry, and
 * CookieAttributionService methods with a mocked postgres query.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../shared/db/postgres-client.js', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  getDbClient: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  generateCookieHash,
  resolveExpiry,
  CookieAttributionService,
} from '../cookie-attribution';

describe('cookie-attribution', () => {
  let service: CookieAttributionService;

  beforeEach(() => {
    service = new CookieAttributionService('test-secret');
    queryMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('generateCookieHash', () => {
    it('produces a 32-char hex string', () => {
      const hash = generateCookieHash('secret');
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
    });

    it('produces unique hashes across calls', () => {
      const h1 = generateCookieHash('secret');
      const h2 = generateCookieHash('secret');
      expect(h1).not.toBe(h2);
    });
  });

  describe('resolveExpiry', () => {
    it('returns a date 90 days out', () => {
      const before = Date.now();
      const expiresAt = resolveExpiry().getTime();
      const expected = before + 90 * 24 * 60 * 60 * 1000;
      // Allow small clock skew within the same tick.
      expect(Math.abs(expiresAt - expected)).toBeLessThan(50);
    });
  });

  describe('constructor', () => {
    it('uses the explicit secret when given', () => {
      const s = new CookieAttributionService('explicit');
      expect((s as unknown as { cookieSecret: string }).cookieSecret).toBe('explicit');
    });

    it('falls back to the env var when no secret is given', () => {
      vi.stubEnv('AFFILIATE_COOKIE_SECRET', 'env-secret');
      const s = new CookieAttributionService();
      expect((s as unknown as { cookieSecret: string }).cookieSecret).toBe('env-secret');
    });

    it('falls back to a default when neither is set', () => {
      vi.stubEnv('AFFILIATE_COOKIE_SECRET', '');
      const s = new CookieAttributionService();
      expect((s as unknown as { cookieSecret: string }).cookieSecret).toBe(
        'default-cookie-secret-change-me',
      );
    });
  });

  describe('createMapping', () => {
    it('inserts an upsert row and returns the cookie hash', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      const hash = await service.createMapping('REF123', '1.2.3.4');
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
      expect(queryMock).toHaveBeenCalledOnce();
      const [sql, params] = queryMock.mock.calls[0]!;
      expect(sql).toContain('INSERT INTO affiliate_cookies');
      expect(sql).toContain('ON CONFLICT (cookie_hash) DO UPDATE');
      expect(params![0]).toBe(hash);
      expect(params![1]).toBe('REF123');
      expect(params![3]).toBe('1.2.3.4');
      expect(params![4]).toBe('1.2.3.4');
      expect(params![2]).toBeInstanceOf(Date);
    });
  });

  describe('getReferralCodeByHash', () => {
    it('returns the code for a valid unexpired row', async () => {
      queryMock.mockResolvedValue({
        rows: [{ referral_code: 'REF123', expires_at: new Date(Date.now() + 1000) }],
      });
      expect(await service.getReferralCodeByHash('abc')).toBe('REF123');
    });

    it('returns null when no row exists', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      expect(await service.getReferralCodeByHash('missing')).toBeNull();
    });

    it('returns null for an expired row', async () => {
      queryMock.mockResolvedValue({
        rows: [{ referral_code: 'REF123', expires_at: new Date(Date.now() - 1000) }],
      });
      expect(await service.getReferralCodeByHash('expired')).toBeNull();
    });
  });

  describe('isValid', () => {
    it('is true when the code resolves', async () => {
      queryMock.mockResolvedValue({
        rows: [{ referral_code: 'REF123', expires_at: new Date(Date.now() + 1000) }],
      });
      expect(await service.isValid('abc')).toBe(true);
    });

    it('is false when the hash is unknown', async () => {
      queryMock.mockReset();
      queryMock.mockResolvedValue({ rows: [] });
      expect(await service.isValid('nope')).toBe(false);
    });
  });

  describe('incrementClickCount', () => {
    it('runs the click-count update', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      await service.incrementClickCount('abc', '5.6.7.8');
      const [sql, params] = queryMock.mock.calls[0]!;
      expect(sql).toContain('UPDATE affiliate_cookies SET click_count = click_count + 1');
      expect(params).toEqual(['abc', '5.6.7.8']);
    });
  });

  describe('purgeExpired', () => {
    it('returns the number of purged rows', async () => {
      queryMock.mockResolvedValue({ rows: [{ count: 1 }, { count: 1 }, { count: 1 }] });
      expect(await service.purgeExpired()).toBe(3);
      const [sql] = queryMock.mock.calls[0]!;
      expect(sql).toContain('DELETE FROM affiliate_cookies WHERE expires_at < NOW()');
    });
  });

  describe('getStatsByCode', () => {
    it('parses the aggregate row into numbers', async () => {
      queryMock.mockResolvedValue({ rows: [{ total_cookies: '5', total_clicks: '12' }] });
      const stats = await service.getStatsByCode('REF123');
      expect(stats).toEqual({ totalCookies: 5, totalClicks: 12 });
      const [sql, params] = queryMock.mock.calls[0]!;
      expect(sql).toContain('COUNT(*) AS total_cookies');
      expect(params).toEqual(['REF123']);
    });
  });

  describe('recordAttribution', () => {
    it('resolves the code then inserts a referral_tracking row', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ referral_code: 'REF123', expires_at: new Date(Date.now() + 1000) }],
        })
        .mockResolvedValueOnce({ rows: [] });
      const signup = new Date('2026-08-01T00:00:00Z');
      await service.recordAttribution('abc', 'tenant-1', 'click-1', signup);
      expect(queryMock).toHaveBeenCalledTimes(2);
      const [sql, params] = queryMock.mock.calls[1]!;
      expect(sql).toContain('INSERT INTO referral_tracking');
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET converted_at');
      expect(params![0]).toBe('click-1');
      expect(params![1]).toBe('REF123');
      expect(params![4]).toBe(signup);
      const meta = JSON.parse(params![5] as string) as Record<string, string>;
      expect(meta.cookieHash).toBe('abc');
      expect(meta.attributionSource).toBe('cookie');
    });

    it('is a no-op when the hash does not resolve to a code', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      await service.recordAttribution('unknown', 'tenant-1', 'click-1', new Date());
      expect(queryMock).toHaveBeenCalledOnce();
    });
  });
});
