/**
 * Polymarket WebSocket Message Parser — Unit Tests
 *
 * Covers parseWsMessage: book/price_change events (best bid/ask from
 * data or top-level fields, midpoint vs one-sided book, empty book),
 * trade events, batch arrays, missing asset_id skipping, unknown event
 * types ignored, malformed JSON rejection.
 */

import { describe, it, expect } from 'vitest';
import { parseWsMessage } from '../polymarket-websocket-message-parser';

describe('parseWsMessage', () => {
  it('parses book event with data.bids/asks into midpoint price', () => {
    const raw = JSON.stringify({
      event_type: 'book',
      asset_id: 'token-1',
      data: {
        bids: [{ price: '0.48', size: '100' }, { price: '0.47', size: '200' }],
        asks: [{ price: '0.52', size: '150' }],
        timestamp: '1700000000',
      },
    });
    const result = parseWsMessage(raw);
    expect(result).toHaveLength(1);
    expect(result[0].tokenId).toBe('token-1');
    expect(result[0].partial.bestBid).toBeCloseTo(0.48);
    expect(result[0].partial.bestAsk).toBeCloseTo(0.52);
    expect(result[0].partial.yesPrice).toBeCloseTo(0.5);
    expect(result[0].partial.noPrice).toBeCloseTo(0.5);
  });

  it('uses top-level bids/asks when data absent', () => {
    const raw = JSON.stringify({
      event_type: 'book',
      asset_id: 'token-2',
      bids: [{ price: '0.30', size: '10' }],
      asks: [{ price: '0.40', size: '10' }],
    });
    const result = parseWsMessage(raw);
    expect(result).toHaveLength(1);
    expect(result[0].partial.bestBid).toBeCloseTo(0.3);
    expect(result[0].partial.bestAsk).toBeCloseTo(0.4);
    expect(result[0].partial.yesPrice).toBeCloseTo(0.35);
  });

  it('uses only bid when ask side empty (one-sided book)', () => {
    const raw = JSON.stringify({
      event_type: 'book',
      asset_id: 'token-3',
      data: { bids: [{ price: '0.60', size: '5' }], asks: [] },
    });
    const result = parseWsMessage(raw);
    expect(result[0].partial.bestAsk).toBe(0);
    expect(result[0].partial.yesPrice).toBeCloseTo(0.6);
    expect(result[0].partial.noPrice).toBeCloseTo(0.4);
  });

  it('falls to ask-only book when no bids', () => {
    const raw = JSON.stringify({ event_type: 'book', asset_id: 't4', data: { bids: [], asks: [{ price: '0.25', size: '5' }] } });
    const result = parseWsMessage(raw);
    expect(result[0].partial.bestBid).toBe(0);
    expect(result[0].partial.yesPrice).toBeCloseTo(0.25);
  });

  it('parses price_change event same as book', () => {
    const raw = JSON.stringify({
      event_type: 'price_change',
      asset_id: 't5',
      data: { bids: [{ price: '0.10', size: '1' }], asks: [{ price: '0.20', size: '1' }] },
    });
    const result = parseWsMessage(raw);
    expect(result).toHaveLength(1);
    expect(result[0].partial.yesPrice).toBeCloseTo(0.15);
  });

  it('parses trade event with lastTradePrice and volume', () => {
    const raw = JSON.stringify({
      event_type: 'trade',
      asset_id: 't6',
      data: { price: '0.75', size: '250.5', side: 'BUY', timestamp: '1700000000' },
    });
    const result = parseWsMessage(raw);
    expect(result).toHaveLength(1);
    const trade = result[0].partial as { lastTradePrice: number; volume24h: number };
    expect(trade.lastTradePrice).toBeCloseTo(0.75);
    expect(trade.volume24h).toBeCloseTo(250.5);
  });

  it('trade event falls back to top-level price/size when data absent', () => {
    const raw = JSON.stringify({ event_type: 'trade', asset_id: 't7', price: '0.99', size: '12' });
    const result = parseWsMessage(raw);
    const trade = result[0].partial as { lastTradePrice: number; volume24h: number };
    expect(trade.lastTradePrice).toBeCloseTo(0.99);
    expect(trade.volume24h).toBeCloseTo(12);
  });

  it('parses batch array of mixed events', () => {
    const raw = JSON.stringify([
      { event_type: 'book', asset_id: 'a', data: { bids: [{ price: '0.4', size: '1' }], asks: [{ price: '0.6', size: '1' }] } },
      { event_type: 'trade', asset_id: 'b', data: { price: '0.5', size: '2' } },
      { asset_id: 'no-type', data: { price: '0.1' } },
    ]);
    const result = parseWsMessage(raw);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.tokenId)).toEqual(['a', 'b']);
  });

  it('uses market field when asset_id missing', () => {
    const raw = JSON.stringify({ event_type: 'book', market: 'market-1', data: { bids: [{ price: '0.5', size: '1' }], asks: [{ price: '0.5', size: '1' }] } });
    const result = parseWsMessage(raw);
    expect(result[0].tokenId).toBe('market-1');
  });

  it('skips events without tokenId', () => {
    const raw = JSON.stringify({ event_type: 'book', data: { bids: [{ price: '0.5', size: '1' }] } });
    expect(parseWsMessage(raw)).toEqual([]);
  });

  it('returns empty for unknown event type', ()  => {
    const raw = JSON.stringify({ event_type: 'sports', asset_id: 't8', data: { price: '0.5' } });
    expect(parseWsMessage(raw)).toEqual([]);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseWsMessage('not-json')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => parseWsMessage('')).toThrow();
  });

  it('uses type field as fallback to event_type', () => {
    const raw = JSON.stringify({ type: 'book', asset_id: 't9', data: { bids: [{ price: '0.2', size: '1' }], asks: [{ price: '0.4', size: '1' }] } });
    const result = parseWsMessage(raw);
    expect(result).toHaveLength(1);
    expect(result[0].partial.yesPrice).toBeCloseTo(0.3);
  });

  it('empty book yields zero prices', () => {
    const raw = JSON.stringify({ event_type: 'book', asset_id: 't10', data: {} });
    const result = parseWsMessage(raw);
    expect(result).toHaveLength(1);
    const p = result[0].partial as { bestBid: number; bestAsk: number; yesPrice: number; noPrice: number };
    expect(p.bestBid).toBe(0);
    expect(p.bestAsk).toBe(0);
    // bestBid=0, bestAsk=0 → yesPrice = bestBid || bestAsk = 0, noPrice = 1
    expect(p.yesPrice).toBe(0);
    expect(p.noPrice).toBe(1);
  });

  it('trade with no data and no top-level price defaults to 0', () => {
    const raw = JSON.stringify({ event_type: 'trade', asset_id: 't11' });
    const result = parseWsMessage(raw);
    const trade = result[0].partial as { lastTradePrice: number; volume24h: number };
    expect(trade.lastTradePrice).toBe(0);
    expect(trade.volume24h).toBe(0);
  });
});
