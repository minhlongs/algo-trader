/**
 * Fixtures for ATR trailing stop tests.
 */

import type { AtrCandle } from '../atr-trailing-stop';

// Sample candles: trending up with volatility
export const uptrendCandles: AtrCandle[] = [
  { high: 102, low: 98, close: 100 },   // 0
  { high: 104, low: 99, close: 103 },   // 1
  { high: 107, low: 102, close: 106 },  // 2
  { high: 108, low: 104, close: 105 },  // 3
  { high: 110, low: 104, close: 109 },  // 4
  { high: 112, low: 107, close: 111 },  // 5
  { high: 115, low: 110, close: 114 },  // 6
  { high: 118, low: 112, close: 117 },  // 7
  { high: 120, low: 115, close: 118 },  // 8
  { high: 122, low: 117, close: 121 },  // 9
  { high: 125, low: 119, close: 124 },  // 10
  { high: 127, low: 122, close: 125 },  // 11
  { high: 130, low: 124, close: 128 },  // 12
  { high: 132, low: 126, close: 131 },  // 13
  { high: 135, low: 128, close: 133 },  // 14
];
