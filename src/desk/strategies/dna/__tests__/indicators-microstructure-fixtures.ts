/**
 * Microstructure test fixtures and helpers.
 */

import type { Candle } from '../multi-tf-types.js';

export function c(overrides: Partial<Candle> = {}): Candle {
  return {
    timestamp: 0,
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 10,
    ...overrides,
  };
}

export const defaultCandles: Candle[] = [
  c({ high: 100, low: 90, close: 95, volume: 10 }),
  c({ high: 110, low: 100, close: 105, volume: 5 }),
];
