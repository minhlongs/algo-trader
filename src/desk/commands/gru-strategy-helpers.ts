/**
 * GRU Strategy CLI Helpers
 * Pure configuration resolution and synthetic OHLCV generation helpers.
 */

import type { OhlcvData } from '../ml/gru/data-preprocessor';

export interface GruCommandOptions {
  inputSteps: number;
  gruUnits: number;
  epochs: number;
  confidenceThreshold: number;
  symbol: string;
  interval: string;
  mode: 'live' | 'backtest';
}

export function resolveGruConfig(options: Partial<GruCommandOptions> = {}): GruCommandOptions {
  return {
    inputSteps: options.inputSteps || 60,
    gruUnits: options.gruUnits || 64,
    epochs: options.epochs || 50,
    confidenceThreshold: options.confidenceThreshold || 0.7,
    symbol: options.symbol || 'BTC/USDT',
    interval: options.interval || '1h',
    mode: options.mode || 'backtest',
  };
}

export function generateMockData(count: number): OhlcvData[] {
  const data: OhlcvData[] = [];
  let price = 50000; // Starting BTC price

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.48) * 1000; // Slight upward bias
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 200;
    const low = Math.min(open, close) - Math.random() * 200;
    const volume = Math.random() * 10000 + 5000;

    data.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return data;
}

export function generateMockCandle(prev: OhlcvData): OhlcvData {
  const change = (Math.random() - 0.48) * 500;
  const open = prev.close;
  const close = open + change;

  return {
    timestamp: Date.now(),
    open,
    high: Math.max(open, close) + Math.random() * 100,
    low: Math.min(open, close) - Math.random() * 100,
    close,
    volume: Math.random() * 10000 + 5000,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
