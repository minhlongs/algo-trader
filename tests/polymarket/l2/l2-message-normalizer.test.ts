import { describe, it, expect } from 'vitest';
import { normalizeMarketMessage } from '../../../src/desk/polymarket/l2/l2-message-normalizer';

const TOKEN = '94592567375755535402382514854858851873438883868449100686326493803085500123190';
const OTHER_TOKEN = '49059554369443439132021076202548798831994166731162662055378257349004241428611';
const CONDITION = '0x835acf3bffe67dcfb5e5f97aba52414739b6f5ff1970195b52d97bb374796155';

function bookFrame(): string {
  return JSON.stringify({
    market: CONDITION,
    asset_id: TOKEN,
    timestamp: '1794488052636',
    hash: 'e2cbccea8098f5b45bc7ee70d73f588e3ebdfa32',
    event_type: 'book',
    tick_size: '0.01',
    last_trade_price: '0.39',
    bids: [{ price: '0.38', size: '2472.83' }, { price: '0.01', size: '29918.02' }],
    asks: [{ price: '0.99', size: '24807.96' }, { price: '0.40', size: '11564.26' }],
  });
}

function priceChangeFrame(): string {
  return JSON.stringify({
    market: CONDITION,
    timestamp: '1794488052754',
    event_type: 'price_change',
    price_changes: [
      { asset_id: OTHER_TOKEN, price: '0.6', size: '11414.26', side: 'BUY', hash: 'aa' },
      { asset_id: TOKEN, price: '0.4', size: '11414.26', side: 'SELL', hash: 'bb' },
    ],
  });
}

describe('normalizeMarketMessage', () => {
  it('maps a book frame to one recorded-l2 row with string levels preserved', () => {
    const rows = normalizeMarketMessage(bookFrame(), 1_000);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.source).toBe('recorded-l2');
    expect(row.eventType).toBe('book');
    expect(row.assetId).toBe(TOKEN);
    expect(row.t).toBe(1794488052636);
    expect(row.market).toBe(CONDITION);
    expect(row.hash).toBe('e2cbccea8098f5b45bc7ee70d73f588e3ebdfa32');
    expect(row.tickSize).toBe('0.01');
    expect(row.lastTradePrice).toBe('0.39');
    expect(row.bids).toEqual([{ price: '0.38', size: '2472.83' }, { price: '0.01', size: '29918.02' }]);
    expect(row.asks).toEqual([{ price: '0.99', size: '24807.96' }, { price: '0.40', size: '11564.26' }]);
  });

  it('fans price_change batches into one row per change, routing BUY to bids and SELL to asks', () => {
    const rows = normalizeMarketMessage(priceChangeFrame(), 1_000);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: 'recorded-l2',
      eventType: 'price_change',
      assetId: OTHER_TOKEN,
      t: 1794488052754,
      bids: [{ price: '0.6', size: '11414.26' }],
      asks: [],
      hash: 'aa',
    });
    expect(rows[1]).toMatchObject({
      eventType: 'price_change',
      assetId: TOKEN,
      bids: [],
      asks: [{ price: '0.4', size: '11414.26' }],
      hash: 'bb',
    });
  });

  it('falls back to the injected clock when the frame has no timestamp', () => {
    const rows = normalizeMarketMessage(
      JSON.stringify({ event_type: 'book', asset_id: TOKEN, bids: [], asks: [] }),
      1_700_000_000_123,
    );
    expect(rows[0].t).toBe(1_700_000_000_123);
  });

  it('ignores trade frames, heartbeats and malformed JSON instead of throwing', () => {
    expect(normalizeMarketMessage(JSON.stringify({ event_type: 'last_trade_price', price: '0.5' }))).toEqual([]);
    expect(normalizeMarketMessage('not-json')).toEqual([]);
    expect(normalizeMarketMessage(JSON.stringify({ event_type: 'book', bids: [], asks: [] }))).toEqual([]);
  });

  it('parses batched frames (array payload) in received order', () => {
    const rows = normalizeMarketMessage(`[${bookFrame()},${priceChangeFrame()}]`, 1_000);
    expect(rows.map((row) => [row.assetId, row.eventType, row.t])).toEqual([
      [TOKEN, 'book', 1794488052636],
      [OTHER_TOKEN, 'price_change', 1794488052754],
      [TOKEN, 'price_change', 1794488052754],
    ]);
  });

  it('drops price_change entries with an unknown side or a non-numeric level', () => {
    const rows = normalizeMarketMessage(
      JSON.stringify({
        event_type: 'price_change',
        timestamp: '1794488052754',
        price_changes: [
          { asset_id: TOKEN, price: '0.4', size: '10', side: 'SIDEWAYS' },
          { asset_id: TOKEN, price: null, size: '10', side: 'BUY' },
        ],
      }),
    );
    expect(rows).toEqual([]);
  });
});
