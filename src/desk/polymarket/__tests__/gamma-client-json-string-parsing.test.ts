/**
 * Unit tests for GammaClientImpl JSON-string field parsing (clobTokenIds,
 * outcomePrices, outcomes, endDate, and inline event markets).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { GammaClientImpl } from '../strategy-runner-types';

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

  it('maps inline event markets in getEvents()', async () => {
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
            outcomes: '["Yes", "No"]',
            outcomePrices: '["0.45", "0.55"]',
            clobTokenIds: '["tok-yes-1", "tok-no-1"]',
            active: true,
            closed: false,
            volume: 25000,
            endDate: '2026-12-01T00:00:00Z',
          },
        ],
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockEvents,
    } as Response);

    const client = new GammaClientImpl();
    const events = await client.getEvents(5);

    expect(events).toHaveLength(1);
    expect(events[0]?.markets).toHaveLength(1);
    expect(events[0]?.markets[0]?.yesTokenId).toBe('tok-yes-1');
    expect(events[0]?.markets[0]?.noTokenId).toBe('tok-no-1');
    expect(events[0]?.markets[0]?.yesPrice).toBeCloseTo(0.45, 4);
  });
});
