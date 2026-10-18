/**
 * Tests for cookie-attribution — affiliate cookie hashing + attribution persistence.
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

import { generateCookieHash, resolveExpiry, CookieAttributionService } from '../cookie-attribution';

describe('cookie-attribution', () => {
  let service: CookieAttributionService;

  beforeEach(() => {
    service = new CookieAttributionService('test-secret');
    queryMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('generateCookieHash & resolveExpiry', () => {
    it('produces unique 32-char hex strings and resolves 90-day expiry', () => {
      const h1 = generateCookieHash('secret');
      const h2 = generateCookieHash('secret');
      expect(h1).toMatch(/^[0-9a-f]{32}$/);
      expect(h1).not.toBe(h2);

      const before = Date.now();
      const expiresAt = resolveExpiry().getTime();
      expect(Math.abs(expiresAt - (before + 90 * 24 * 60 * 60 * 1000))).toBeLessThan(50);
    });
  });

  describe('constructor', () => {
    it('uses explicit secret, env fallback, or default secret', () => {
      expect((new CookieAttributionService('explicit') as unknown as { cookieSecret: string }).cookieSecret).toBe('explicit');

      vi.stubEnv('AFFILIATE_COOKIE_SECRET', 'env-secret');
      expect((new CookieAttributionService() as unknown as { cookieSecret: string }).cookieSecret).toBe('env-secret');

      vi.stubEnv('AFFILIATE_COOKIE_SECRET', '');
      expect((new CookieAttributionService() as unknown as { cookieSecret: string }).cookieSecret).toBe('default-cookie-secret-change-me');
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
      expect(params![2]).toBeInstanceOf(Date);
      expect(params![3]).toBe('1.2.3.4');
      expect(params![4]).toBe('1.2.3.4');
    });
  });

  describe('getReferralCodeByHash & isValid', () => {
    it('returns the code for a valid unexpired row and null for missing or expired rows', async () => {
      queryMock.mockResolvedValue({ rows: [{ referral_code: 'REF123', expires_at: new Date(Date.now() + 1000) }] });
      expect(await service.getReferralCodeByHash('abc')).toBe('REF123');
      expect(await service.isValid('abc')).toBe(true);

      queryMock.mockResolvedValue({ rows: [] });
      expect(await service.getReferralCodeByHash('missing')).toBeNull();
      expect(await service.isValid('nope')).toBe(false);

      queryMock.mockResolvedValue({ rows: [{ referral_code: 'REF123', expires_at: new Date(Date.now() - 1000) }] });
      expect(await service.getReferralCodeByHash('expired')).toBeNull();
    });
  });

  describe('incrementClickCount, purgeExpired & getStatsByCode', () => {
    it('updates click count, purges expired rows, and aggregates stats', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      await service.incrementClickCount('abc', '5.6.7.8');
      expect(queryMock.mock.calls[0]![0]).toContain('UPDATE affiliate_cookies SET click_count = click_count + 1');
      expect(queryMock.mock.calls[0]![1]).toEqual(['abc', '5.6.7.8']);

      queryMock.mockReset();
      queryMock.mockResolvedValue({ rows: [{ count: 1 }, { count: 1 }, { count: 1 }] });
      expect(await service.purgeExpired()).toBe(3);
      expect(queryMock.mock.calls[0]![0]).toContain('DELETE FROM affiliate_cookies WHERE expires_at < NOW()');

      queryMock.mockReset();
      queryMock.mockResolvedValue({ rows: [{ total_cookies: '5', total_clicks: '12' }] });
      expect(await service.getStatsByCode('REF123')).toEqual({ totalCookies: 5, totalClicks: 12 });
      expect(queryMock.mock.calls[0]![0]).toContain('COUNT(*) AS total_cookies');
      expect(queryMock.mock.calls[0]![1]).toEqual(['REF123']);
    });
  });

  describe('recordAttribution', () => {
    it('resolves the code then inserts a referral_tracking row', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ referral_code: 'REF123', expires_at: new Date(Date.now() + 1000) }] })
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
      expect(meta).toMatchObject({ cookieHash: 'abc', attributionSource: 'cookie' });
    });

    it('is a no-op when the hash does not resolve to a code', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      await service.recordAttribution('unknown', 'tenant-1', 'click-1', new Date());
      expect(queryMock).toHaveBeenCalledOnce();
    });
  });
});
