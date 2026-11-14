import { describe, it, expect, vi } from 'vitest';
import {
  createGammaFeeScheduleResolver,
  type GammaFeeScheduleResolverOptions,
} from '../../src/desk/polymarket/fee-schedule-resolver';

type FetchArgs = [input: string, init?: RequestInit];

/** Every resolved Gamma row carries the two `clobTokenIds` the market trades under. */
const TOKEN_YES = '1111111111111111111111111111111111111111111111111111111111111111';
const TOKEN_NO = '2222222222222222222222222222222222222222222222222222222222222222';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A resolver wired to a fetch double that records the URLs it was asked for. */
function makeResolver(respond: (url: string) => Response | Promise<Response>, opts: Partial<GammaFeeScheduleResolverOptions> = {}) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (...args: FetchArgs) => {
    const url = String(args[0]);
    calls.push(url);
    return respond(url);
  }) as unknown as typeof fetch;
  const resolver = createGammaFeeScheduleResolver({ fetchImpl, ...opts });
  return { resolver, calls, fetchImpl };
}

const CRYPTO_ROW = {
  feesEnabled: true,
  clobTokenIds: JSON.stringify([TOKEN_YES, TOKEN_NO]),
  feeSchedule: { exponent: 1, rate: 0.07, takerOnly: true, rebateRate: 0.2 },
};

describe('Gamma fee schedule resolver', () => {
  describe('reading the published schedule', () => {
    it('returns the four published fields for a fee-charging market', async () => {
      const { resolver } = makeResolver(() => jsonResponse([CRYPTO_ROW]));
      await expect(resolver.resolve(TOKEN_YES)).resolves.toEqual({
        exponent: 1,
        rate: 0.07,
        takerOnly: true,
        rebateRate: 0.2,
      });
    });

    it('parses `feeSchedule` delivered as a JSON-encoded string', async () => {
      const row = {
        ...CRYPTO_ROW,
        feeSchedule: JSON.stringify({ exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.25 }),
      };
      const { resolver } = makeResolver(() => jsonResponse([row]));
      const schedule = await resolver.resolve(TOKEN_YES);
      expect(schedule?.rate).toBe(0.04);
      expect(schedule?.rebateRate).toBe(0.25);
    });

    it('defaults exponent to 1, rebateRate to 0 and takerOnly to true when omitted', async () => {
      const row = { feesEnabled: true, feeSchedule: { rate: 0.05 } };
      const { resolver } = makeResolver(() => jsonResponse([row]));
      await expect(resolver.resolve(TOKEN_YES)).resolves.toEqual({
        exponent: 1,
        rate: 0.05,
        takerOnly: true,
        rebateRate: 0,
      });
    });

    it('returns null for a market the exchange publishes as exempt even if stale feeSchedule metadata exists', async () => {
      const row = {
        feesEnabled: false,
        clobTokenIds: JSON.stringify([TOKEN_YES]),
        feeSchedule: { exponent: 1, rate: 0.07, takerOnly: true, rebateRate: 0.2 },
      };
      const { resolver } = makeResolver(() => jsonResponse([row]));
      await expect(resolver.resolve(TOKEN_YES)).resolves.toBeNull();
    });

    it('returns null when the market omits feesEnabled and publishes no schedule', async () => {
      const { resolver } = makeResolver(() => jsonResponse([{ question: 'anything' }]));
      await expect(resolver.resolve(TOKEN_YES)).resolves.toBeNull();
    });

    it('throws when feesEnabled is true but the schedule cannot be parsed', async () => {
      const row = { feesEnabled: true, feeSchedule: 'not-json' };
      const { resolver } = makeResolver(() => jsonResponse([row]));
      await expect(resolver.resolve(TOKEN_YES)).rejects.toThrow(/feesEnabled=true/);
    });

    it('throws when feesEnabled is omitted and feeSchedule payload is corrupt', async () => {
      const row = { clobTokenIds: JSON.stringify([TOKEN_YES]), feeSchedule: 'corrupt-payload' };
      const { resolver } = makeResolver(() => jsonResponse([row]));
      await expect(resolver.resolve(TOKEN_YES)).rejects.toThrow(/unparsable feeSchedule/);
    });
  });

  describe('selecting the market', () => {
    it('picks the row whose clobTokenIds contains the requested token', async () => {
      const other = {
        feesEnabled: true,
        clobTokenIds: JSON.stringify(['9999']),
        feeSchedule: { exponent: 1, rate: 0.03, takerOnly: true, rebateRate: 0.15 },
      };
      const { resolver } = makeResolver(() => jsonResponse([other, CRYPTO_ROW]));
      const schedule = await resolver.resolve(TOKEN_NO);
      expect(schedule?.rate).toBe(0.07);
    });

    it('accepts a clobTokenIds array that is already parsed', async () => {
      const row = { ...CRYPTO_ROW, clobTokenIds: [TOKEN_YES, TOKEN_NO] };
      const { resolver } = makeResolver(() => jsonResponse({ data: [row] }));
      await expect(resolver.resolve(TOKEN_NO)).resolves.toMatchObject({ rate: 0.07 });
    });

    it('falls back to the first row when no row lists the token', async () => {
      const row = { ...CRYPTO_ROW, clobTokenIds: JSON.stringify(['9999']) };
      const { resolver } = makeResolver(() => jsonResponse([row]));
      await expect(resolver.resolve(TOKEN_YES)).resolves.toMatchObject({ rate: 0.07 });
    });

    it('throws when Gamma returns no market at all', async () => {
      const { resolver } = makeResolver(() => jsonResponse([]));
      await expect(resolver.resolve(TOKEN_YES)).rejects.toThrow(/no market for token/);
    });
  });

  describe('transport failure', () => {
    it('throws with the status when Gamma responds non-OK', async () => {
      const { resolver } = makeResolver(() => jsonResponse({ error: 'boom' }, 429));
      await expect(resolver.resolve(TOKEN_YES)).rejects.toThrow(/HTTP 429/);
    });

    it('rejects an empty token id instead of asking the exchange', async () => {
      const { resolver, calls } = makeResolver(() => jsonResponse([CRYPTO_ROW]));
      await expect(resolver.resolve('')).rejects.toThrow(/requires a token id/);
      expect(calls).toHaveLength(0);
    });

    it('requests the token id and a single row from the markets endpoint', async () => {
      const { resolver, calls } = makeResolver(() => jsonResponse([CRYPTO_ROW]));
      await resolver.resolve(TOKEN_YES);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain('/markets?clob_token_ids=');
      expect(calls[0]).toContain(encodeURIComponent(TOKEN_YES));
      expect(calls[0]).toContain('limit=1');
    });
  });

  describe('caching', () => {
    it('serves a repeated lookup from the TTL cache', async () => {
      const { resolver, calls } = makeResolver(() => jsonResponse([CRYPTO_ROW]));
      await resolver.resolve(TOKEN_YES);
      await resolver.resolve(TOKEN_YES);
      expect(calls).toHaveLength(1);
    });

    it('caches an exempt result too', async () => {
      const { resolver, calls } = makeResolver(() => jsonResponse([{ feesEnabled: false }]));
      await resolver.resolve(TOKEN_YES);
      await resolver.resolve(TOKEN_YES);
      expect(calls).toHaveLength(1);
    });

    it('re-requests once the TTL elapses', async () => {
      const { resolver, calls } = makeResolver(() => jsonResponse([CRYPTO_ROW]), { ttlMs: 0 });
      await resolver.resolve(TOKEN_YES);
      await resolver.resolve(TOKEN_YES);
      expect(calls).toHaveLength(2);
    });

    it('shares one in-flight request between concurrent lookups', async () => {
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const { resolver, calls } = makeResolver(async () => {
        await gate;
        return jsonResponse([CRYPTO_ROW]);
      });
      const [first, second] = [resolver.resolve(TOKEN_YES), resolver.resolve(TOKEN_YES)];
      release?.();
      const [a, b] = await Promise.all([first, second]);
      expect(a).toEqual(b);
      expect(calls).toHaveLength(1);
    });

    it('does not cache a failure, so the next lookup retries', async () => {
      let attempt = 0;
      const { resolver, calls } = makeResolver(() => {
        attempt += 1;
        return attempt === 1 ? jsonResponse({ error: 'boom' }, 500) : jsonResponse([CRYPTO_ROW]);
      });
      await expect(resolver.resolve(TOKEN_YES)).rejects.toThrow(/HTTP 500/);
      await expect(resolver.resolve(TOKEN_YES)).resolves.toMatchObject({ rate: 0.07 });
      expect(calls).toHaveLength(2);
    });
  });
});
