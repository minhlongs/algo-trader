/**
 * Shared fixtures and helpers for cross-platform arbitrage detector tests.
 */

export interface KalshiMarketFixture {
  ticker: string;
  title: string;
  yesPrice: number;
  status: string;
}

export interface PolyMarketFixture {
  id: string;
  question: string;
  outcomePrices?: string | string[];
  yesPrice?: number;
}

export function makeKalshiMarket(overrides: Partial<KalshiMarketFixture> = {}): KalshiMarketFixture {
  return {
    ticker: 'TEST-001',
    title: 'Will BTC exceed 100k?',
    yesPrice: 0.55,
    status: 'open',
    ...overrides,
  };
}

export function makePolyMarket(overrides: Partial<PolyMarketFixture> = {}): PolyMarketFixture {
  return {
    id: 'poly-001',
    question: 'Will Bitcoin exceed 100k by end of 2025?',
    outcomePrices: undefined,
    yesPrice: undefined,
    ...overrides,
  };
}

export function seedKalshiCache(
  mockKalshiPrices: { mockReturnValue: (map: Map<string, KalshiMarketFixture>) => void },
  markets: Array<Partial<KalshiMarketFixture> & { ticker?: string; title?: string; yesPrice?: number }>,
): void {
  const map = new Map<string, KalshiMarketFixture>();
  for (const m of markets) {
    const full = makeKalshiMarket(m);
    map.set(full.ticker, full);
  }
  mockKalshiPrices.mockReturnValue(map);
}
