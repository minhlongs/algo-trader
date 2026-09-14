export const BINANCE_API = 'https://api.binance.com/api/v3/klines';
export const EXCHANGE = 'binance';
export const MAX_PER_REQUEST = 500;
export const DELAY_MS = 250;

export type BinanceKline = [
  number, string, string, string, string, string,
  number, string, number, number, string, string
];

export function toBinanceSymbol(symbol: string): string | null {
  const base = symbol.split('/')[0]?.toUpperCase();
  if (!base) return null;
  if (base === 'AVAX') return null;
  return `${base}USDT`;
}

export function requireBinanceSymbol(symbol: string): string {
  const bs = toBinanceSymbol(symbol);
  if (!bs) {
    throw new Error(`No Binance spot listing for symbol: ${symbol}`);
  }
  return bs;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
