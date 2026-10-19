/**
 * Whale Copy Trader Types and Pure Calculations
 *
 * @module desk/strategies/polymarket/whale-copy-trader-types
 */

import type { WhaleActivity } from '../../feeds/whale-activity-feed';

export interface WhaleStats {
  walletAddress: string;
  totalTrades: number;
  wins: number;
  losses: number;
  /** Accuracy 0–1; neutral 0.5 when insufficient data */
  accuracy: number;
  totalVolumeUsdc: number;
}

export interface CopySignal {
  whale: WhaleActivity;
  copySize: number; // USDC to deploy in paper trade
  copyRatio: number; // fraction of whale size (0.01 = 1%)
  confidence: number; // 0–1, derived from whale accuracy + position size
}

export const DEFAULT_COPY_RATIO = 0.01; // 1% of whale size
export const MAX_COPY_PCT_OF_PORTFOLIO = 0.05; // cap at 5% of portfolio
export const PAPER_PORTFOLIO_USDC = 1_000; // matches orchestrator default
export const MIN_CONFIDENCE = 0.35;
export const MIN_TRADES_FOR_ACCURACY = 5;
export const NATS_SIGNAL_TOPIC = 'signal.validated';

export function calculateWhaleAccuracy(wins: number, totalTrades: number): number {
  return totalTrades >= MIN_TRADES_FOR_ACCURACY ? wins / totalTrades : 0.5;
}

export function buildWhaleCopySignal(
  activity: WhaleActivity,
  stats: WhaleStats,
  copyRatio: number,
  maxCopyUsdc: number,
): CopySignal | null {
  const volumeBonus = Math.min(0.15, Math.log10(activity.size / 1_000) * 0.05);
  const confidence = stats.accuracy * 0.85 + volumeBonus;

  if (confidence < MIN_CONFIDENCE) return null;

  const rawCopy = activity.size * copyRatio;
  const copySize = Math.min(rawCopy, maxCopyUsdc);
  if (copySize < 1) return null;

  return {
    whale: activity,
    copySize,
    copyRatio,
    confidence,
  };
}
