/**
 * Unit tests for GammaClientImpl JSON-string field parsing (clobTokenIds,
 * outcomePrices, outcomes, endDate, and inline event markets).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { GammaClientImpl, createNoopEventBus, DEFAULT_RUNNER_CONFIG } from '../strategy-runner-types';

describe('GammaClientImpl JSON-string payload parsing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses JSON-string clobTokenIds, outcomePrices, outcomes, and endDate when tokens is null', async () => {
    const mockRawMarket = {
      id: '531202',
      conditionId: '0xabc123',
      question: 'Will BitBoy be convicted?',
      slug: 'bitboy-convicted',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.1325", "0.8675"]',
      clobTokenIds: '["75467129615908319583031474642658885479135230431889036121812713428992454630178", "53265963358335483677337178306561373452556358777712708046287082972709215609195"]',
      tokens: null,
      active: true,
      closed: false,
      volume: '37470.453469',
      volume24hr: 4250.5,
      liquidityNum: 1205.27,
      endDate: '2026-12-31T12:00:00Z',
      end_date_iso: null,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [mockRawMarket],
    } as Response);

    const client = new GammaClientImpl();
    const markets = await client.getTrending(1);

    expect(markets).toHaveLength(1);
    const m = markets[0]!;
    expect(m.id).toBe('531202');
    expect(m.conditionId).toBe('0xabc123');
    expect(m.yesTokenId).toBe('75467129615908319583031474642658885479135230431889036121812713428992454630178');
    expect(m.noTokenId).toBe('53265963358335483677337178306561373452556358777712708046287082972709215609195');
    expect(m.yesPrice).toBeCloseTo(0.1325, 6);
    expect(m.outcomes).toEqual(['Yes', 'No']);
    expect(m.outcomePrices).toEqual(['0.1325', '0.8675']);
    expect(m.endDate).toBe('2026-12-31T12:00:00Z');
    expect(m.volume).toBeCloseTo(37470.453469, 4);
    expect(m.volume24h).toBeCloseTo(4250.5, 4);
    expect(m.tokens).toHaveLength(2);
  });

  it('maps inline event markets in getEvents() and handles non-ok responses', async () => {
    const mockEvents = [
      {
        id: 'evt-1',
        title: 'Fed Rate Cut Event',
        slug: 'fed-rate-cut',
        markets: [
          {
            id: 'm-1',
            conditionId: '0xcond1',
            question: 'Cut in Q1?',
            slug: 'cut-q1',
            outcomes: ['Yes', 'No'],
            outcomePrices: '[invalid-json',
            clobTokenIds: 12345,
            tokens: [
              { token_id: 'tok-yes-1', outcome: 'Yes', price: 0.45 },
              { token_id: 'tok-no-1', outcome: 'No', price: 0.55 },
            ],
            active: true,
            closed: false,
            volume: 25000,
            endDate: '2026-12-01T00:00:00Z',
          },
        ],
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockEvents,
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

    const client = new GammaClientImpl();
    const events = await client.getEvents(5);

    expect(events).toHaveLength(1);
    expect(events[0]?.markets).toHaveLength(1);
    expect(events[0]?.markets[0]?.yesTokenId).toBe('tok-yes-1');
    expect(events[0]?.markets[0]?.noTokenId).toBe('tok-no-1');
    expect(events[0]?.markets[0]?.yesPrice).toBeCloseTo(0.45, 4);

    const emptyEvents = await client.getEvents(5);
    expect(emptyEvents).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('covers getMarket, searchMarkets, getMarkets error, getMarketGroup, and noop eventBus', async () => {
    const client = new GammaClientImpl();
    await expect(client.getMarketGroup('g1')).rejects.toThrow('getMarketGroup not implemented');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{
          id: 'm-2',
          conditionId: '0xcond2',
          question: 'Q2?',
          slug: 'q2',
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.6","0.4"]',
          clobTokenIds: '["y2","n2"]',
          active: true,
          closed: false,
        }],
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response);

    const m = await client.getMarket('0xcond2');
    expect(m?.yesTokenId).toBe('y2');
    expect(await client.getMarket('missing')).toBeNull();
    expect(await client.searchMarkets('crypto')).toEqual([]);
    expect(await client.searchMarkets('fail')).toEqual([]);
    await expect(client.getMarkets()).rejects.toThrow('Gamma API error 500');

    const bus = createNoopEventBus();
    bus.emit('test', {});
    bus.on('test', () => {});
    bus.off('test', () => {});
    expect(DEFAULT_RUNNER_CONFIG.tickIntervalMs).toBe(30_000);
  });
});
