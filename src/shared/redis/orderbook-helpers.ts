/**
 * Shared Redis Orderbook Serialization & Depth Helpers
 */

export interface OrderBookLevel {
  price: number;
  amount: number;
}

export interface OrderBook {
  exchange: string;
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export function buildZsetMembers(
  levels: OrderBookLevel[],
  descending: boolean,
): Array<{ score: number; value: string }> {
  return levels.map((level) => ({
    score: descending ? -level.price : level.price,
    value: `${level.price}:${level.amount}`,
  }));
}

export function parseBestWithScores(result: string[] | null | undefined): OrderBookLevel | null {
  if (!result || result.length === 0) return null;
  const [member] = result;
  const [price, amount] = member.split(':').map(parseFloat);
  return { price, amount };
}

export function parseTopLevelsWithScores(raw: string[]): OrderBookLevel[] {
  const result: OrderBookLevel[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const [price, amount] = raw[i].split(':').map(parseFloat);
    result.push({ price, amount });
  }
  return result;
}

export function calculateBookDepth(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
): { bidDepth: number; askDepth: number } {
  const bidDepth = bids.reduce((sum, level) => sum + level.amount, 0);
  const askDepth = asks.reduce((sum, level) => sum + level.amount, 0);
  return { bidDepth, askDepth };
}
