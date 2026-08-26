/**
 * Binance Funding Feed Tests
 *
 * Fixture-driven parser tests — no network calls. The feed parser is
 * exported so tests can use committed real API responses.
 */

import { describe, it, expect } from 'vitest';
import { parseFundingRateResponse, fetchBinanceFundingHistory, type FundingRateRow } from '../binance-funding-feed';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE_PATH = join(__dirname, 'fixtures', 'funding-rate-page.json');

describe('parseFundingRateResponse', () => {
  it('parses real Binance Futures fundingRate response correctly', () => {
    const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Array<{
      symbol: string;
      fundingTime: number;
      fundingRate: string;
      markPrice?: string;
      rateType?: string;
    }>;
    const sourceUrl = 'https://fapi.binance.com/fapi/v1/fundingRate';
    const rows = parseFundingRateResponse('BTCUSDT', raw, sourceUrl);

    expect(rows).toHaveLength(3);

    // First row
    expect(rows[0].symbol).toBe('BTCUSDT');
    expect(rows[0].exchange).toBe('binance-futures');
    expect(rows[0].fundingTime).toEqual(new Date(1787644800000));
    expect(rows[0].fundingRate).toBe(0.0001);
    expect(rows[0].markPrice).toBeCloseTo(79668.15473913, 4);
    expect(rows[0].rateType).toBe('Regular');
    expect(rows[0].sourceUrl).toBe(sourceUrl);
    expect(rows[0].retrievedAt).toBeInstanceOf(Date);

    // Second row
    expect(rows[1].fundingRate).toBe(0.0001);
    expect(rows[1].markPrice).toBeCloseTo(79464.07655072, 4);

    // Third row
    expect(rows[2].fundingRate).toBe(0.00007734);
    expect(rows[2].markPrice).toBeCloseTo(78505.4, 1);
  });

  it('handles missing optional fields gracefully', () => {
    const raw = [
      { symbol: 'BTCUSDT', fundingTime: 1700000000000, fundingRate: '0.0001' },
      { symbol: 'BTCUSDT', fundingTime: 1700000000001, fundingRate: '0.0002', markPrice: '50000' },
    ];
    const rows = parseFundingRateResponse('BTCUSDT', raw, 'test');
    expect(rows).toHaveLength(2);
    expect(rows[0].markPrice).toBeUndefined();
    expect(rows[0].rateType).toBeUndefined();
    expect(rows[1].markPrice).toBe(50000);
    expect(rows[1].rateType).toBeUndefined();
  });

  it('preserves retrieval timestamp per call', () => {
    const raw = [{ symbol: 'BTCUSDT', fundingTime: 1700000000000, fundingRate: '0.0001' }];
    const rows1 = parseFundingRateResponse('BTCUSDT', raw, 'test');
    const rows2 = parseFundingRateResponse('BTCUSDT', raw, 'test');
    // Each call creates new retrievedAt timestamps
    expect(rows1[0].retrievedAt).toBeInstanceOf(Date);
    expect(rows2[0].retrievedAt).toBeInstanceOf(Date);
  });

  it('produces rows with strictly positive fundingTime', () => {
    const raw = [
      { symbol: 'BTCUSDT', fundingTime: 1, fundingRate: '0.0001' },
      { symbol: 'BTCUSDT', fundingTime: 2, fundingRate: '0.0002' },
    ];
    const rows = parseFundingRateResponse('BTCUSDT', raw, 'test');
    expect(rows[0].fundingTime.getTime()).toBeLessThan(rows[1].fundingTime.getTime());
  });
});

// Integration test using real DB (follows existing desk data test pattern)
// This test requires a real Postgres connection via DATABASE_URL
describe.skipIf(!process.env.DATABASE_URL)('binance-funding-feed integration (real DB)', () => {
  it('fetches and stores funding rates for BTCUSDT', async () => {
    const stats = await fetchBinanceFundingHistory('BTCUSDT', 7);
    expect(stats.fetched).toBeGreaterThan(0);
    expect(stats.stored).toBeGreaterThan(0);
    expect(stats.oldest).toBeInstanceOf(Date);
    expect(stats.newest).toBeInstanceOf(Date);
    // Oldest should be ~7 days ago
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(stats.oldest!.getTime()).toBeGreaterThanOrEqual(weekAgo - 8 * 60 * 60 * 1000);
  }, 60_000); // 60s timeout for real API calls
});