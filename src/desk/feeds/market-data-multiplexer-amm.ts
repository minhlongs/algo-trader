/**
 * Market Data Multiplexer AMM Curve Slice Generators
 *
 * @module desk/feeds/market-data-multiplexer-amm
 */

import type { OrderBookLevel } from '../sor/sor-types';
import type { CpmmPoolParams, LmsrPoolParams } from './market-data-multiplexer-types';

export class MarketDataMultiplexerAmm {
  public static generateCpmmSlices(params: CpmmPoolParams): {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
  } {
    const slices = params.slices ?? 10;
    const maxDepth = params.baseReserve * (params.maxDepthRatio ?? 0.2);
    const sliceQty = maxDepth / slices;
    const k = params.baseReserve * params.quoteReserve;
    const asks: OrderBookLevel[] = [];
    const bids: OrderBookLevel[] = [];

    let curB = params.baseReserve;
    let curQ = params.quoteReserve;
    for (let i = 0; i < slices; i++) {
      const nextB = curB - sliceQty;
      if (nextB <= 0) break;
      const nextQ = k / nextB;
      asks.push([(nextQ - curQ) / sliceQty, sliceQty]);
      curB = nextB;
      curQ = nextQ;
    }

    curB = params.baseReserve;
    curQ = params.quoteReserve;
    for (let i = 0; i < slices; i++) {
      const nextB = curB + sliceQty;
      const nextQ = k / nextB;
      bids.push([(curQ - nextQ) / sliceQty, sliceQty]);
      curB = nextB;
      curQ = nextQ;
    }

    return { bids, asks };
  }

  public static generateLmsrSlices(params: LmsrPoolParams): {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
  } {
    const slices = params.slices ?? 10;
    const sliceQty = (params.maxDepthShares ?? 100) / slices;
    const b = params.b;
    const cost = (q: readonly number[]) => {
      const max = Math.max(...q);
      return b * (Math.log(q.reduce((acc, v) => acc + Math.exp((v - max) / b), 0)) + max / b);
    };

    const asks: OrderBookLevel[] = [];
    const bids: OrderBookLevel[] = [];
    for (let i = 1; i <= slices; i++) {
      const buyQ = [...params.liabilities];
      buyQ[params.outcomeIndex] += i * sliceQty;
      const prevBuy = [...params.liabilities];
      prevBuy[params.outcomeIndex] += (i - 1) * sliceQty;
      asks.push([(cost(buyQ) - cost(prevBuy)) / sliceQty, sliceQty]);

      const sellQ = [...params.liabilities];
      sellQ[params.outcomeIndex] -= i * sliceQty;
      const prevSell = [...params.liabilities];
      prevSell[params.outcomeIndex] -= (i - 1) * sliceQty;
      bids.push([(cost(prevSell) - cost(sellQ)) / sliceQty, sliceQty]);
    }

    return { bids, asks };
  }
}
