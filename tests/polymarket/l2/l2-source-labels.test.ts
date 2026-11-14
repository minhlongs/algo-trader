import { describe, it, expect } from 'vitest';
import {
  L2_SOURCE_LABELS,
  L2_SOURCE_DATA_API_V2,
  L2_SOURCE_POLY_BOOK_PARQUET,
  L2_SOURCE_POLY_BOOK_WAL,
  L2_SOURCE_PRICES_HISTORY,
  L2_SOURCE_RECORDED,
  assertL2SourceLabel,
  isL2SourceLabel,
  makeDataApiV2TradeRow,
  makePricesHistoryRow,
} from '../../../src/desk/polymarket/l2/l2-source-labels';

describe('l2 source labels', () => {
  it('exposes the five allowed observed provenance labels including poly-book', () => {
    expect([...L2_SOURCE_LABELS]).toEqual([
      'recorded-l2',
      'poly-book-wal',
      'poly-book-parquet',
      'data-api-v2',
      'prices-history',
    ]);
    expect(L2_SOURCE_RECORDED).toBe('recorded-l2');
    expect(L2_SOURCE_POLY_BOOK_WAL).toBe('poly-book-wal');
    expect(L2_SOURCE_POLY_BOOK_PARQUET).toBe('poly-book-parquet');
    expect(L2_SOURCE_DATA_API_V2).toBe('data-api-v2');
    expect(L2_SOURCE_PRICES_HISTORY).toBe('prices-history');
  });

  it('accepts known labels and rejects synthetic/unknown labels', () => {
    for (const label of L2_SOURCE_LABELS) expect(isL2SourceLabel(label)).toBe(true);
    for (const bad of [
      'simulated',
      'synthetic-regime',
      'ohlcv-store',
      'recorded',
      'RECORDED-L2',
      '',
      null,
      undefined,
      42,
      {},
    ]) {
      expect(isL2SourceLabel(bad)).toBe(false);
    }
  });

  it('assertL2SourceLabel throws with the offending value', () => {
    expect(() => assertL2SourceLabel('simulated')).toThrow(/simulated/);
    expect(() => assertL2SourceLabel('data-api-v2')).not.toThrow();
  });

  it('builds retroactive trade rows labelled data-api-v2', () => {
    const row = makeDataApiV2TradeRow({
      t: 1_794_487_905_000,
      conditionId: '0xcond',
      tokenId: '123',
      side: 'BUY',
      price: 0.39,
      size: 46.85,
      outcome: 'Yes',
      title: 'Some market',
      slug: 'some-market',
      wallet: '0xabc',
      transactionHash: '0xhash',
    });

    expect(row.source).toBe('data-api-v2');
    expect(isL2SourceLabel(row.source)).toBe(true);
    expect(row.price).toBe(0.39);
  });

  it('builds retroactive price rows labelled prices-history', () => {
    const row = makePricesHistoryRow({ t: 1_794_437_958_000, tokenId: '123', price: 0.36 });
    expect(row).toEqual({ source: 'prices-history', t: 1_794_437_958_000, tokenId: '123', price: 0.36 });
    expect(isL2SourceLabel(row.source)).toBe(true);
  });
});
