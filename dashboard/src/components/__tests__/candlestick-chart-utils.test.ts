import { describe, it, expect } from 'vitest';
import {
  generateInitialCandles,
  deriveVolumeData,
  calculateNextCandle,
  CYBER_CHART_THEME,
} from '../candlestick-chart-utils';

describe('candlestick-chart-utils', () => {
  it('generates the specified count of initial candles', () => {
    const candles = generateInitialCandles(50);
    expect(candles.length).toBe(51); // 0 to count inclusive
    expect(candles[0]).toHaveProperty('time');
    expect(candles[0]).toHaveProperty('open');
    expect(candles[0]).toHaveProperty('high');
    expect(candles[0]).toHaveProperty('low');
    expect(candles[0]).toHaveProperty('close');
  });

  it('derives volume data matching candle length', () => {
    const candles = generateInitialCandles(10);
    const volume = deriveVolumeData(candles);
    expect(volume.length).toBe(candles.length);
    expect(volume[0]).toHaveProperty('value');
    expect(volume[0]).toHaveProperty('color');
  });

  it('calculates next candle on new minute and within same minute', () => {
    const candles = generateInitialCandles(5);
    const lastTime = candles[candles.length - 1].time as unknown as number;

    // Within same minute
    const sameMinuteResult = calculateNextCandle(candles, 51000, lastTime * 1000 + 10000);
    expect(sameMinuteResult.updatedList.length).toBe(candles.length);
    expect(sameMinuteResult.updatedBar.close).toBe(51000);

    // New minute
    const nextMinuteResult = calculateNextCandle(candles, 52000, (lastTime + 60) * 1000);
    expect(nextMinuteResult.updatedList.length).toBe(candles.length + 1);
    expect(nextMinuteResult.updatedBar.close).toBe(52000);
  });

  it('exports valid Cyber-Glass chart theme tokens', () => {
    expect(CYBER_CHART_THEME.profit).toBe('#00FFA3');
    expect(CYBER_CHART_THEME.loss).toBe('#FF2E93');
  });
});
