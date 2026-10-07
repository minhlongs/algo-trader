import { describe, it, expect } from 'vitest';
import {
  parseVenueOrderBook,
  parseVenueTrade,
} from '../../../../src/desk/data/multi-venue-streamer-parsers';

describe('multi-venue-streamer-parsers', () => {
  describe('parseVenueOrderBook', () => {
    it('parses binance depthUpdate message with full fields', () => {
      const res = parseVenueOrderBook('binance', {
        e: 'depthUpdate',
        s: 'BTCUSDT',
        E: 1600000000000,
        u: 12345,
        b: [['50000.5', '1.2']],
        a: [['50001.0', '0.8']],
      });
      expect(res).toEqual({
        venue: 'binance',
        symbol: 'BTCUSDT',
        timestamp: 1600000000000,
        seq: 12345,
        bids: [{ price: 50000.5, amount: 1.2 }],
        asks: [{ price: 50001.0, amount: 0.8 }],
      });
    });

    it('parses binance with lastUpdateId and missing optional fields', () => {
      const res = parseVenueOrderBook('binance', {
        lastUpdateId: 999,
        b: 'not-an-array',
        a: null,
      });
      expect(res).not.toBeNull();
      expect(res?.venue).toBe('binance');
      expect(res?.symbol).toBe('');
      expect(res?.seq).toBe(999);
      expect(res?.bids).toEqual([]);
      expect(res?.asks).toEqual([]);
      expect(typeof res?.timestamp).toBe('number');
    });

    it('parses hyperliquid l2Book message', () => {
      const res = parseVenueOrderBook('hyperliquid', {
        channel: 'l2Book',
        data: {
          coin: 'SOL',
          time: 1700000000,
          levels: [
            [{ px: '145.2', sz: '10' }],
            [{ px: '145.5', sz: '15' }],
          ],
        },
      });
      expect(res).toEqual({
        venue: 'hyperliquid',
        symbol: 'SOL',
        timestamp: 1700000000,
        seq: 1700000000,
        bids: [{ price: 145.2, amount: 10 }],
        asks: [{ price: 145.5, amount: 15 }],
      });
    });

    it('returns null for hyperliquid without levels or wrong channel', () => {
      expect(parseVenueOrderBook('hyperliquid', { channel: 'l2Book', data: {} })).toBeNull();
      expect(parseVenueOrderBook('hyperliquid', { channel: 'other' })).toBeNull();
    });

    it('parses polymarket book event with asset_id', () => {
      const res = parseVenueOrderBook('polymarket', {
        event_type: 'book',
        asset_id: '0x123',
        bids: [{ price: '0.45', size: '100' }],
        asks: [{ price: '0.55', size: '200' }],
      });
      expect(res?.venue).toBe('polymarket');
      expect(res?.symbol).toBe('0x123');
      expect(res?.bids).toEqual([{ price: 0.45, amount: 100 }]);
      expect(res?.asks).toEqual([{ price: 0.55, amount: 200 }]);
    });

    it('parses polymarket with market and non-array bids/asks', () => {
      const res = parseVenueOrderBook('polymarket', {
        market: '0x456',
        bids: null,
        asks: 'invalid',
      });
      expect(res?.venue).toBe('polymarket');
      expect(res?.symbol).toBe('0x456');
      expect(res?.bids).toEqual([]);
      expect(res?.asks).toEqual([]);
    });

    it('parses polymarket with empty symbol fallback and neither bids nor asks array', () => {
      const res = parseVenueOrderBook('polymarket', {
        event_type: 'book',
      });
      expect(res?.symbol).toBe('');
      expect(res?.bids).toEqual([]);
      expect(res?.asks).toEqual([]);
    });

    it('returns null for unrecognized venue or unhandled message', () => {
      expect(parseVenueOrderBook('unknown' as any, {})).toBeNull();
      expect(parseVenueOrderBook('binance', { e: 'other' })).toBeNull();
      expect(parseVenueOrderBook('polymarket', { event_type: 'unknown' })).toBeNull();
    });
  });

  describe('parseVenueTrade', () => {
    it('parses binance trade event for buyer and seller', () => {
      const buy = parseVenueTrade('binance', {
        e: 'trade',
        s: 'ETHUSDT',
        m: false,
        p: '2500.5',
        q: '2.5',
        T: 1690000000000,
        t: 'tr123',
      });
      expect(buy).toEqual({
        venue: 'binance',
        symbol: 'ETHUSDT',
        side: 'buy',
        price: 2500.5,
        amount: 2.5,
        timestamp: 1690000000000,
        tradeId: 'tr123',
      });

      const sell = parseVenueTrade('binance', {
        e: 'trade',
        m: true,
      });
      expect(sell?.side).toBe('sell');
      expect(sell?.symbol).toBe('');
      expect(sell?.price).toBe(0);
      expect(sell?.amount).toBe(0);
      expect(sell?.tradeId).toBe('');
    });

    it('parses hyperliquid trade message with B, buy, and sell sides', () => {
      const buyB = parseVenueTrade('hyperliquid', {
        channel: 'trades',
        data: [{ coin: 'BTC', side: 'B', px: '60000', sz: '0.1', time: 1000, hash: '0xabc' }],
      });
      expect(buyB?.side).toBe('buy');
      expect(buyB?.tradeId).toBe('0xabc');

      const buyWord = parseVenueTrade('hyperliquid', {
        channel: 'trades',
        data: [{ coin: 'BTC', side: 'buy', px: '60000', sz: '0.1', time: 1000, tid: 55 }],
      });
      expect(buyWord?.side).toBe('buy');
      expect(buyWord?.tradeId).toBe('55');

      const sellS = parseVenueTrade('hyperliquid', {
        channel: 'trades',
        data: [{ coin: 'BTC', side: 'S', px: '60000', sz: '0.1', time: 1000 }],
      });
      expect(sellS?.side).toBe('sell');
      expect(typeof sellS?.tradeId).toBe('string');
    });

    it('returns null for hyperliquid with empty or non-array trades', () => {
      expect(parseVenueTrade('hyperliquid', { channel: 'trades', data: [] })).toBeNull();
      expect(parseVenueTrade('hyperliquid', { channel: 'other', data: [{}] })).toBeNull();
    });

    it('parses polymarket last_trade_price and trade event', () => {
      const ltp = parseVenueTrade('polymarket', {
        event_type: 'last_trade_price',
        asset_id: '0xtoken',
        side: 'BUY',
        price: '0.62',
        size: '500',
        timestamp: 1710000000,
        trade_id: 'tx_01',
      });
      expect(ltp).toEqual({
        venue: 'polymarket',
        symbol: '0xtoken',
        side: 'buy',
        price: 0.62,
        amount: 500,
        timestamp: 1710000000,
        tradeId: 'tx_01',
      });

      const tradeLower = parseVenueTrade('polymarket', {
        event_type: 'trade',
        market: '0xmarket',
        side: 'buy',
        price: '0.3',
        size: '10',
      });
      expect(tradeLower?.symbol).toBe('0xmarket');
      expect(tradeLower?.side).toBe('buy');

      const sellPoly = parseVenueTrade('polymarket', {
        event_type: 'trade',
        side: 'SELL',
      });
      expect(sellPoly?.symbol).toBe('');
      expect(sellPoly?.side).toBe('sell');
      expect(sellPoly?.price).toBe(0);
      expect(sellPoly?.amount).toBe(0);
    });

    it('returns null for unhandled events or venues', () => {
      expect(parseVenueTrade('binance', { e: 'kline' })).toBeNull();
      expect(parseVenueTrade('polymarket', { event_type: 'other' })).toBeNull();
      expect(parseVenueTrade('unknown' as any, {})).toBeNull();
    });
  });
});
