/**
 * POLY-G5 Public Beta — CLOB Top-of-Book Quote Sourcing Tests (H4).
 *
 * Gamma's `updatedAt` is a feed-level stamp served behind `max-age=300`, so it can
 * never satisfy a 30s gate. These tests pin the CLOB `/books` path that replaced it:
 * per-token exchange timestamps, correct best-of-book selection, and fail-closed
 * behaviour when no genuine quote exists.
 */

import { describe, expect, it } from 'vitest';
import { fetchSupportedBetaMarkets, isMarketSnapshotFresh } from '../../src/platform/poly-beta/poly-beta-markets';
import { parseClobBook } from '../../src/platform/poly-beta/poly-beta-market-quotes';
import { collectGammaCandidates } from '../../src/platform/poly-beta/poly-beta-market-normalization';

function gammaPayload(updatedAt: string) {
  return JSON.stringify([
    {
      id: 'mkt-clob-1',
      question: 'Will the Fed cut rates in December 2026?',
      clobTokenIds: '["yes-token-1","no-token-1"]',
      bestBid: '0.41',
      bestAsk: '0.45',
      updatedAt,
      active: true,
      orderPriceMinTickSize: '0.01',
      orderMinSize: '5',
    },
  ]);
}

function clobBooksPayload(timestampMs: number) {
  return JSON.stringify([
    {
      asset_id: 'yes-token-1',
      timestamp: String(timestampMs),
      // CLOB returns bids ascending and asks descending: best bid is the LAST bid,
      // best ask is the LAST ask. Taking [0] would invert the book.
      bids: [
        { price: '0.30', size: '500' },
        { price: '0.38', size: '400' },
        { price: '0.44', size: '250' },
      ],
      asks: [
        { price: '0.52', size: '300' },
        { price: '0.49', size: '420' },
        { price: '0.46', size: '180' },
      ],
    },
  ]);
}

/** Routes on path, not host: the harness points both upstreams at a dead local port. */
function routedFetch(gammaBody: string, clobBody: string | null, onClob?: () => void): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/gamma/markets')) return new Response(gammaBody, { status: 200 });
    if (url.includes('/clob/books')) {
      onClob?.();
      if (clobBody === null) return new Response('upstream down', { status: 502 });
      return new Response(clobBody, { status: 200 });
    }
    return new Response('unexpected url', { status: 400 });
  }) as typeof fetch;
}

describe('POLY-G5 — CLOB top-of-book quote sourcing', () => {
  it('sources freshness from the CLOB book even when Gamma updatedAt is minutes stale', async () => {
    const nowMs = Date.parse('2026-11-16T10:00:00.000Z');
    const { env } = await (await import('./poly-beta-test-harness')).createPolyBetaTestHarness();
    let clobCalls = 0;

    const feed = await fetchSupportedBetaMarkets(env, {
      nowMs,
      fetchImpl: routedFetch(
        gammaPayload(new Date(nowMs - 240_000).toISOString()),
        clobBooksPayload(nowMs - 3_000),
        () => { clobCalls += 1; },
      ),
    });

    expect(clobCalls).toBe(1);
    expect(feed.feedHealthy).toBe(true);
    expect(feed.staleReason).toBeNull();
    expect(feed.markets).toHaveLength(1);
    const market = feed.markets[0]!;
    expect(market.sourceTimestampMs).toBe(nowMs - 3_000);
    // Best bid = max(bids) and best ask = min(asks), not bids[0] / asks[0].
    expect(market.bestBid).toBe(0.44);
    expect(market.bestAsk).toBe(0.46);
    expect(market.midPrice).toBe(0.45);
  });

  it('fails closed when the CLOB book is unavailable and Gamma is stale', async () => {
    const nowMs = Date.parse('2026-11-16T10:00:00.000Z');
    const { env } = await (await import('./poly-beta-test-harness')).createPolyBetaTestHarness();

    const feed = await fetchSupportedBetaMarkets(env, {
      nowMs,
      fetchImpl: routedFetch(gammaPayload(new Date(nowMs - 240_000).toISOString()), null),
    });

    expect(feed.feedHealthy).toBe(false);
    expect(feed.markets).toEqual([]);
    expect(feed.staleReason).toMatch(/stale/i);
  });

  it('falls back to a genuine Gamma quote when the CLOB book has no usable levels', async () => {
    const nowMs = Date.parse('2026-11-16T10:00:00.000Z');
    const { env } = await (await import('./poly-beta-test-harness')).createPolyBetaTestHarness();

    const feed = await fetchSupportedBetaMarkets(env, {
      nowMs,
      fetchImpl: routedFetch(
        gammaPayload(new Date(nowMs - 5_000).toISOString()),
        JSON.stringify([{ asset_id: 'yes-token-1', timestamp: String(nowMs), bids: [], asks: [] }]),
      ),
    });

    expect(feed.feedHealthy).toBe(true);
    expect(feed.markets[0]!.bestBid).toBe(0.41);
    expect(feed.markets[0]!.bestAsk).toBe(0.45);
  });

  it('rejects crossed, empty, and out-of-range books instead of synthesizing a quote', () => {
    const ts = '1763300000000';
    expect(parseClobBook({ asset_id: 't', timestamp: ts, bids: [{ price: '0.60', size: '1' }], asks: [{ price: '0.50', size: '1' }] })).toBeNull();
    expect(parseClobBook({ asset_id: 't', timestamp: ts, bids: [], asks: [{ price: '0.50', size: '1' }] })).toBeNull();
    expect(parseClobBook({ asset_id: 't', timestamp: ts, bids: [{ price: '0', size: '1' }], asks: [{ price: '1', size: '1' }] })).toBeNull();
    expect(parseClobBook({ asset_id: 't', timestamp: ts, bids: [{ price: '0.4', size: '0' }], asks: [{ price: '0.5', size: '1' }] })).toBeNull();
    expect(parseClobBook({ asset_id: 't', bids: [{ price: '0.4', size: '1' }], asks: [{ price: '0.5', size: '1' }] })).toBeNull();
  });

  it('normalizes a seconds-epoch book timestamp instead of reading it as decades stale', () => {
    const seconds = 1_763_300_000;
    const quote = parseClobBook({
      asset_id: 't',
      timestamp: String(seconds),
      bids: [{ price: '0.40', size: '1' }],
      asks: [{ price: '0.50', size: '1' }],
    });
    expect(quote?.timestampMs).toBe(seconds * 1_000);
  });

  it('treats a missing or future source timestamp as stale', () => {
    const nowMs = Date.parse('2026-11-16T10:00:00.000Z');
    const base = { sourceTimestampMs: 0 } as Parameters<typeof isMarketSnapshotFresh>[0];
    expect(isMarketSnapshotFresh(base, nowMs).fresh).toBe(false);
    expect(isMarketSnapshotFresh({ ...base, sourceTimestampMs: nowMs + 60_000 }, nowMs).fresh).toBe(false);
    expect(isMarketSnapshotFresh({ ...base, sourceTimestampMs: nowMs - 29_000 }, nowMs).fresh).toBe(true);
    expect(isMarketSnapshotFresh({ ...base, sourceTimestampMs: nowMs - 31_000 }, nowMs).fresh).toBe(false);
  });
});

describe('collectGammaCandidates', () => {
  const valid = {
    id: 'mkt-ok-1',
    question: 'Will CPI fall below 2% in 2027?',
    slug: 'cpi-below-2-2027',
    clobTokenIds: '["yes-1","no-1"]',
    bestBid: '0.40',
    bestAsk: '0.45',
  };

  it('skips non-objects, closed, inactive, and question-less entries', () => {
    const got = collectGammaCandidates(
      [
        null,
        'not-an-object',
        42,
        { ...valid, id: 'mkt-closed', closed: true },
        { ...valid, id: 'mkt-inactive', active: false },
        { ...valid, id: 'mkt-no-question', question: '   ' },
        { ...valid, id: '', slug: '', question: 'No id?' },
        valid,
      ],
      12,
    );
    expect(got.map((c) => c.marketId)).toEqual(['mkt-ok-1']);
  });

  it('stops at the market cap and falls back to the slug for a missing id', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...valid, id: undefined, slug: `slug-${i}` }));
    const capped = collectGammaCandidates(many, 2);
    expect(capped.map((c) => c.marketId)).toEqual(['slug-0', 'slug-1']);
    expect(capped[0]!.tickSize).toBe(0.01);
    expect(capped[0]!.minOrderShares).toBe(5);
  });
});
