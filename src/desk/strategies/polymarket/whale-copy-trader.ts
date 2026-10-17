/**
 * Whale Copy Trader — listens to whale-activity-feed, tracks per-wallet accuracy,
 * scales copy positions at copyRatio (default 1%) and publishes to NATS
 * 'signal.validated' for paper-trading-orchestrator.
 */

import { logger } from '../../../shared/utils/logger';
import { getMessageBus } from '../../../shared/messaging/index';
import { startWhaleActivityFeed } from '../../feeds/whale-activity-feed';
import type { WhaleActivity } from '../../feeds/whale-activity-feed';
import {
  type WhaleStats,
  type CopySignal,
  DEFAULT_COPY_RATIO,
  MAX_COPY_PCT_OF_PORTFOLIO,
  PAPER_PORTFOLIO_USDC,
  NATS_SIGNAL_TOPIC,
  calculateWhaleAccuracy,
  buildWhaleCopySignal,
} from './whale-copy-trader-types';

export {
  type WhaleStats,
  type CopySignal,
  DEFAULT_COPY_RATIO,
  MAX_COPY_PCT_OF_PORTFOLIO,
  PAPER_PORTFOLIO_USDC,
} from './whale-copy-trader-types';

export class WhaleCopyTrader {
  private whaleStats: Map<string, WhaleStats> = new Map();
  private running = false;
  private copyRatio: number;
  private maxCopyUsdc: number;

  constructor(opts?: { copyRatio?: number; portfolioUsdc?: number }) {
    this.copyRatio = opts?.copyRatio ?? DEFAULT_COPY_RATIO;
    const portfolio = opts?.portfolioUsdc ?? PAPER_PORTFOLIO_USDC;
    this.maxCopyUsdc = portfolio * MAX_COPY_PCT_OF_PORTFOLIO;
  }

  /** Start listening to whale activity feed and emitting copy signals */
  start(pollMs?: number): void {
    if (this.running) return;
    this.running = true;

    const feed = startWhaleActivityFeed(pollMs);
    feed.onWhaleActivity((activity) => this.handleWhaleActivity(activity));

    logger.info('[WhaleCopyTrader] Started', {
      copyRatio: this.copyRatio,
      maxCopyUsdc: this.maxCopyUsdc,
    });
  }

  /** Record trade outcome to update whale accuracy stats */
  recordOutcome(walletAddress: string, won: boolean): void {
    const addr = walletAddress.toLowerCase();
    const stats = this.getOrCreateStats(addr);
    if (won) stats.wins++;
    else stats.losses++;
    stats.totalTrades = stats.wins + stats.losses;
    stats.accuracy = calculateWhaleAccuracy(stats.wins, stats.totalTrades);
    logger.debug('[WhaleCopyTrader] Outcome recorded', { addr, accuracy: stats.accuracy });
  }

  /** Read-only view of tracked whale stats */
  getStats(): Map<string, WhaleStats> {
    return new Map(this.whaleStats);
  }

  private handleWhaleActivity(activity: WhaleActivity): void {
    const stats = this.getOrCreateStats(activity.walletAddress);
    stats.totalVolumeUsdc += activity.size;

    const signal = buildWhaleCopySignal(activity, stats, this.copyRatio, this.maxCopyUsdc);
    if (!signal) return;

    logger.info('[WhaleCopyTrader] Copy signal generated', {
      wallet: activity.walletAddress.slice(0, 10) + '...',
      marketId: activity.marketId,
      side: activity.side,
      whaleSize: activity.size,
      copySize: signal.copySize,
      confidence: signal.confidence.toFixed(3),
    });

    this.publishSignal(signal);
  }

  private publishSignal(signal: CopySignal): void {
    const envelope = {
      original: {
        signalType: 'whale-copy',
        markets: [
          {
            id: signal.whale.marketId,
            title: `Whale copy: ${signal.whale.marketId.slice(0, 12)}...`,
            yesPrice: signal.whale.side === 'YES' ? signal.whale.price : 1 - signal.whale.price,
            noPrice: signal.whale.side === 'NO' ? signal.whale.price : 1 - signal.whale.price,
          },
        ],
        expectedEdge: signal.confidence * 0.1,
        reasoning: `Whale copy: ${signal.whale.walletAddress.slice(0, 10)} opened ${signal.whale.side} $${signal.whale.size.toFixed(0)} @ ${signal.whale.price.toFixed(3)}. Confidence=${signal.confidence.toFixed(3)}`,
      },
    };

    const bus = getMessageBus();
    if (!bus.isConnected()) {
      logger.warn('[WhaleCopyTrader] NATS not connected — signal dropped');
      return;
    }

    bus.publish(NATS_SIGNAL_TOPIC, envelope, 'whale-copy-trader').catch((err) =>
      logger.warn('[WhaleCopyTrader] NATS publish failed', { err }),
    );
  }

  private getOrCreateStats(walletAddress: string): WhaleStats {
    if (!this.whaleStats.has(walletAddress)) {
      this.whaleStats.set(walletAddress, {
        walletAddress,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        accuracy: 0.5,
        totalVolumeUsdc: 0,
      });
    }
    return this.whaleStats.get(walletAddress)!;
  }
}

let traderInstance: WhaleCopyTrader | null = null;

/** Start the singleton whale copy trader. Idempotent. */
export function startWhaleCopyTrader(opts?: {
  copyRatio?: number;
  portfolioUsdc?: number;
  pollMs?: number;
}): WhaleCopyTrader {
  if (!traderInstance) {
    traderInstance = new WhaleCopyTrader(opts);
    traderInstance.start(opts?.pollMs);
  }
  return traderInstance;
}
