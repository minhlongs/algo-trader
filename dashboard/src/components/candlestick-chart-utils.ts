import { Time } from 'lightweight-charts';
import { COLORS } from '../lib/stitch-design-tokens';

export interface CandlestickData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumeData {
  time: Time;
  value: number;
  color: string;
}

/**
 * Generate simulated initial candles for a given pair
 */
export function generateInitialCandles(count = 100): CandlestickData[] {
  const list: CandlestickData[] = [];
  const now = Math.floor(Date.now() / 1000);
  let close = 50000;
  for (let i = count; i >= 0; i--) {
    const open = close + (Math.random() - 0.5) * 100;
    const high = Math.max(open, close) + Math.random() * 50;
    const low = Math.min(open, close) - Math.random() * 50;
    close = open + (Math.random() - 0.5) * 100;
    list.push({
      time: (now - i * 60) as unknown as Time,
      open,
      high,
      low,
      close,
    });
  }
  return list;
}

/**
 * Derive volume histogram dataset from candlestick series
 */
export function deriveVolumeData(candles: CandlestickData[]): VolumeData[] {
  return candles.map((c) => {
    const isUp = c.close >= c.open;
    return {
      time: c.time,
      value: Math.abs(c.close - c.open) * (1000 + Math.random() * 500),
      color: isUp ? 'rgba(0, 255, 163, 0.25)' : 'rgba(255, 46, 147, 0.25)',
    };
  });
}

/**
 * Update candlestick and volume bar based on latest tick
 */
export function calculateNextCandle(
  prevCandles: CandlestickData[],
  midPrice: number,
  timestamp: number
): { updatedList: CandlestickData[]; updatedBar: CandlestickData; volumeBar: VolumeData } {
  const nowSeconds = Math.floor(timestamp / 1000);
  const minuteSeconds = Math.floor(nowSeconds / 60) * 60;

  if (prevCandles.length === 0) {
    const initialCandle: CandlestickData = {
      time: minuteSeconds as unknown as Time,
      open: midPrice,
      high: midPrice,
      low: midPrice,
      close: midPrice,
    };
    const volBar: VolumeData = {
      time: initialCandle.time,
      value: 1000,
      color: 'rgba(0, 255, 163, 0.25)',
    };
    return { updatedList: [initialCandle], updatedBar: initialCandle, volumeBar: volBar };
  }

  const last = prevCandles[prevCandles.length - 1];
  const isNewMinute = minuteSeconds > (last.time as unknown as number);

  let updatedBar: CandlestickData;
  let updatedList: CandlestickData[];

  if (isNewMinute) {
    updatedBar = {
      time: minuteSeconds as unknown as Time,
      open: last.close,
      high: Math.max(last.close, midPrice),
      low: Math.min(last.close, midPrice),
      close: midPrice,
    };
    updatedList = [...prevCandles, updatedBar].slice(-200);
  } else {
    updatedBar = {
      ...last,
      high: Math.max(last.high, midPrice),
      low: Math.min(last.low, midPrice),
      close: midPrice,
    };
    updatedList = [...prevCandles.slice(0, -1), updatedBar];
  }

  const isUp = updatedBar.close >= updatedBar.open;
  const volumeBar: VolumeData = {
    time: updatedBar.time,
    value: Math.abs(updatedBar.close - updatedBar.open) * (1000 + Math.random() * 500),
    color: isUp ? 'rgba(0, 255, 163, 0.25)' : 'rgba(255, 46, 147, 0.25)',
  };

  return { updatedList, updatedBar, volumeBar };
}

export const CYBER_CHART_THEME = {
  background: COLORS.surfaceHigh,
  textColor: COLORS.onSurfaceVariant,
  gridColor: 'rgba(255, 255, 255, 0.03)',
  borderColor: 'rgba(255, 255, 255, 0.05)',
  profit: '#00FFA3',
  loss: '#FF2E93',
  primary: COLORS.primary,
};
