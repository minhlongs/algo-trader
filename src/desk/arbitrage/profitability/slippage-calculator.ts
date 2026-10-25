/**
 * Profitability Slippage Calculator
 * Computes level-by-level VWAP order book slippage and parametric square-root impact slippage.
 */

import type {
  RawOrderBookDepth,
  SlippageModelConfig,
  VwapSlippageResult,
} from './profitability-types';
import {
  emptySlippageResult,
  normalizeBookLevels,
  slippageBps,
  walkBookContraSide,
  walkBookProSide,
} from './slippage-book-walk';

export function calculateVwapSlippage(
  orderBook: RawOrderBookDepth,
  side: 'buy' | 'sell',
  targetAmount: number
): VwapSlippageResult {
  if (!orderBook || targetAmount <= 0) return emptySlippageResult();

  if (side === 'buy') {
    // Asks are walked worst-price-last: ascending price is the adverse direction.
    const asks = normalizeBookLevels(orderBook.asks, 'pro');
    if (asks.length === 0) return emptySlippageResult();

    const walk = walkBookProSide(asks, targetAmount);
    return {
      vwap: walk.vwap,
      slippageUsd: walk.slippagePerUnit * walk.filledAmount,
      slippageBps: slippageBps(walk.slippagePerUnit, asks[0]!.price),
      filledAmount: walk.filledAmount,
      insufficientLiquidity: walk.insufficient,
    };
  }

  // side === 'sell'
  // Bids are walked worst-price-last: descending price is the adverse direction.
  const bids = normalizeBookLevels(orderBook.bids, 'contra');
  if (bids.length === 0) return emptySlippageResult();

  const walk = walkBookContraSide(bids, targetAmount);
  return {
    vwap: walk.vwap,
    slippageUsd: walk.slippagePerUnit * walk.filledAmount,
    slippageBps: slippageBps(walk.slippagePerUnit, bids[0]!.price),
    filledAmount: walk.filledAmount,
    insufficientLiquidity: walk.insufficient,
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
