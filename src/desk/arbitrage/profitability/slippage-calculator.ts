/**
 * Profitability Slippage Calculator
 * Computes level-by-level VWAP order book slippage and parametric square-root impact slippage.
 */

import type {
  RawOrderBookDepth,
  SlippageModelConfig,
  VwapSlippageResult,
} from './profitability-types';

export function calculateVwapSlippage(
  orderBook: RawOrderBookDepth,
  side: 'buy' | 'sell',
  targetAmount: number
): VwapSlippageResult {
  if (!orderBook || targetAmount <= 0) {
    return {
      vwap: 0,
      slippageUsd: 0,
      slippageBps: 0,
      filledAmount: 0,
      insufficientLiquidity: true,
    };
  }

  if (side === 'buy') {
    const rawAsks = orderBook.asks ?? [];
    if (rawAsks.length === 0) {
      return {
        vwap: 0,
        slippageUsd: 0,
        slippageBps: 0,
        filledAmount: 0,
        insufficientLiquidity: true,
      };
    }

    const sortedAsks = rawAsks
      .map((lvl) => (Array.isArray(lvl) ? { price: lvl[0], amount: lvl[1] } : lvl))
      .filter((lvl) => lvl.price > 0 && lvl.amount > 0)
      .sort((a, b) => a.price - b.price);

    if (sortedAsks.length === 0) {
      return {
        vwap: 0,
        slippageUsd: 0,
        slippageBps: 0,
        filledAmount: 0,
        insufficientLiquidity: true,
      };
    }

    const bestAsk = sortedAsks[0].price;
    let remaining = targetAmount;
    let totalCost = 0;
    let totalFilled = 0;

    for (const level of sortedAsks) {
      const fill = Math.min(remaining, level.amount);
      totalCost += fill * level.price;
      totalFilled += fill;
      remaining -= fill;
      if (remaining <= 0) break;
    }

    const insufficientLiquidity = remaining > 0;
    const vwap = totalFilled > 0 ? totalCost / totalFilled : 0;
    const slippagePerUnit = Math.max(0, vwap - bestAsk);
    const slippageUsd = slippagePerUnit * totalFilled;
    const slippageBps = bestAsk > 0 ? (slippagePerUnit / bestAsk) * 10_000 : 0;

    return {
      vwap,
      slippageUsd,
      slippageBps,
      filledAmount: totalFilled,
      insufficientLiquidity,
    };
  }

  // side === 'sell'
  const rawBids = orderBook.bids ?? [];
  if (rawBids.length === 0) {
    return {
      vwap: 0,
      slippageUsd: 0,
      slippageBps: 0,
      filledAmount: 0,
      insufficientLiquidity: true,
    };
  }

  const sortedBids = rawBids
    .map((lvl) => (Array.isArray(lvl) ? { price: lvl[0], amount: lvl[1] } : lvl))
    .filter((lvl) => lvl.price > 0 && lvl.amount > 0)
    .sort((a, b) => b.price - a.price);

  if (sortedBids.length === 0) {
    return {
      vwap: 0,
      slippageUsd: 0,
      slippageBps: 0,
      filledAmount: 0,
      insufficientLiquidity: true,
    };
  }

  const bestBid = sortedBids[0].price;
  let remaining = targetAmount;
  let totalRevenue = 0;
  let totalFilled = 0;

  for (const level of sortedBids) {
    const fill = Math.min(remaining, level.amount);
    totalRevenue += fill * level.price;
    totalFilled += fill;
    remaining -= fill;
    if (remaining <= 0) break;
  }

  const insufficientLiquidity = remaining > 0;
  const vwap = totalFilled > 0 ? totalRevenue / totalFilled : 0;
  const slippagePerUnit = Math.max(0, bestBid - vwap);
  const slippageUsd = slippagePerUnit * totalFilled;
  const slippageBps = bestBid > 0 ? (slippagePerUnit / bestBid) * 10_000 : 0;

  return {
    vwap,
    slippageUsd,
    slippageBps,
    filledAmount: totalFilled,
    insufficientLiquidity,
  };
}

export function calculateParametricSlippage(
  venue: string,
  notionalUsd: number,
  cfg: SlippageModelConfig
): VwapSlippageResult {
  const isPoly = venue.toLowerCase() === 'polymarket';
  const baseBps = isPoly ? cfg.polyBaseSlippageBps : cfg.cexBaseSlippageBps;
  const impactFactor = isPoly ? cfg.polyImpactFactorBps : cfg.cexImpactFactorBps;
  const liquidity = isPoly ? cfg.polyDefaultLiquidityUsd : cfg.cexDefaultLiquidityUsd;

  const ratio = Math.max(0, notionalUsd / liquidity);
  const impactBps = impactFactor * Math.pow(ratio, cfg.impactAlpha);
  const slippageBps = baseBps + impactBps;
  const slippageUsd = notionalUsd * (slippageBps / 10_000);

  return {
    vwap: 0,
    slippageUsd,
    slippageBps,
    filledAmount: notionalUsd,
    insufficientLiquidity: false,
  };
}
