import type { VenueBook, VenueId, OrderSide, OrderBookLevel } from './sor-types';

export interface UnifiedLiquidityLevel {
  venueId: VenueId;
  price: number;
  quantity: number;
  takerFeeBps: number;
  gasCostUsd: number;
}

export function synthesizeCpmmOrderBook(params: {
  baseReserve: number;
  quoteReserve: number;
  slices?: number;
  maxDepthRatio?: number;
}): { bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
  const slices = params.slices ?? 10;
  const maxDepth = params.baseReserve * (params.maxDepthRatio ?? 0.20);
  const sliceQty = maxDepth / slices;
  const k = params.baseReserve * params.quoteReserve;

  const asks: OrderBookLevel[] = [];
  const bids: OrderBookLevel[] = [];

  let currentBase = params.baseReserve;
  let currentQuote = params.quoteReserve;
  for (let i = 0; i < slices; i++) {
    const nextBase = currentBase - sliceQty;
    if (nextBase <= 0) break;
    const nextQuote = k / nextBase;
    const quoteDelta = nextQuote - currentQuote;
    const marginalPrice = quoteDelta / sliceQty;
    asks.push([marginalPrice, sliceQty]);
    currentBase = nextBase;
    currentQuote = nextQuote;
  }

  currentBase = params.baseReserve;
  currentQuote = params.quoteReserve;
  for (let i = 0; i < slices; i++) {
    const nextBase = currentBase + sliceQty;
    const nextQuote = k / nextBase;
    const quoteDelta = currentQuote - nextQuote;
    const marginalPrice = quoteDelta / sliceQty;
    bids.push([marginalPrice, sliceQty]);
    currentBase = nextBase;
    currentQuote = nextQuote;
  }

  return { bids, asks };
}

export function synthesizeLmsrOrderBook(params: {
  liabilities: number[];
  b: number;
  outcomeIndex: number;
  slices?: number;
  maxDepth?: number;
}): { bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
  const slices = params.slices ?? 10;
  const maxDepth = params.maxDepth ?? params.b * 0.5;
  const sliceQty = maxDepth / slices;
  const { liabilities, b, outcomeIndex } = params;

  const costFn = (q: number[]): number => {
    const maxScaled = Math.max(...q.map((v) => v / b));
    const sumExp = q.reduce((acc, v) => acc + Math.exp(v / b - maxScaled), 0);
    return b * (maxScaled + Math.log(sumExp));
  };

  const asks: OrderBookLevel[] = [];
  const bids: OrderBookLevel[] = [];
  const currentQ = [...liabilities];

  for (let i = 0; i < slices; i++) {
    const costBefore = costFn(currentQ);
    currentQ[outcomeIndex] += sliceQty;
    const costAfter = costFn(currentQ);
    const marginalPrice = (costAfter - costBefore) / sliceQty;
    asks.push([marginalPrice, sliceQty]);
  }

  const sellQ = [...liabilities];
  for (let i = 0; i < slices; i++) {
    const costBefore = costFn(sellQ);
    sellQ[outcomeIndex] -= sliceQty;
    const costAfter = costFn(sellQ);
    const marginalPrice = (costBefore - costAfter) / sliceQty;
    bids.push([marginalPrice, sliceQty]);
  }

  return { bids, asks };
}

export function computeTopDepth(books: Iterable<VenueBook>, side: OrderSide, levels = 5): number {
  let total = 0;
  for (const book of books) {
    const ladder = side === 'BUY' ? book.asks : book.bids;
    for (let i = 0; i < Math.min(levels, ladder.length); i++) {
      total += ladder[i][1];
    }
  }
  return total;
}

export function mergeUnifiedLadder(
  books: Iterable<VenueBook>,
  side: OrderSide
): UnifiedLiquidityLevel[] {
  const ladder: UnifiedLiquidityLevel[] = [];
  for (const book of books) {
    const levels = side === 'BUY' ? book.asks : book.bids;
    for (const [price, quantity] of levels) {
      if (quantity > 0) {
        ladder.push({
          venueId: book.venueId,
          price,
          quantity,
          takerFeeBps: book.takerFeeBps,
          gasCostUsd: book.gasCostUsd ?? 0,
        });
      }
    }
  }
  return ladder;
}
