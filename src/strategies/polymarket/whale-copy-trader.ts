/**
 * Whale Copy Trader — listens to whale-activity-feed, tracks per-wallet accuracy,
 * scales copy positions at copyRatio (default 1%) and publishes to NATS
 * 'signal.validated' for paper-trading-orchestrator.
 */

import { logger } from '../../shared/utils/logger';
import { getMessageBus } from '../../shared/messaging/index';
import { startWhaleActivityFeed } from '../../feeds/whale-activity-feed';
import type { WhaleActivity } from '../../feeds/whale-activity-feed';

// ── Public types ────────────────────────────────────────────────────────────
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
  copySize: number;       // USDC to deploy in paper trade
  copyRatio: number;      // fraction of whale size (0.01 = 1%)
  confidence: number;     // 0–1, derived from whale accuracy + position size
}

// ── Config ──────────────────────────────────────────────────────────────────
const DEFAULT_COPY_RATIO = 0.01;        // 1% of whale size
const MAX_COPY_PCT_OF_PORTFOLIO = 0.05; // cap at 5% of portfolio
const PAPER_PORTFOLIO_USDC = 1_000;     // matches orchestrator default
const MIN_CONFIDENCE = 0.35;
const MIN_TRADES_FOR_ACCURACY = 5;
const NATS_SIGNAL_TOPIC = 'signal.validated';

// ── WhaleCopyTrader ──────────────────────────────────────────────────────────
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
    if (won) stats.wins++; else stats.losses++;
    stats.totalTrades = stats.wins + stats.losses;
    stats.accuracy = stats.totalTrades >= MIN_TRADES_FOR_ACCURACY
      ? stats.wins / stats.totalTrades
      : 0.5; // neutral prior when insufficient data
    logger.debug('[WhaleCopyTrader] Outcome recorded', { addr, accuracy: stats.accuracy });
  }

  /** Read-only view of tracked whale stats */
  getStats(): Map<string, WhaleStats> {
    return new Map(this.whaleStats);
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private handleWhaleActivity(activity: WhaleActivity): void {
    // Update observed volume for this wallet
    const stats = this.getOrCreateStats(activity.walletAddress);
    stats.totalVolumeUsdc += activity.size;

    const signal = this.buildSignal(activity, stats);
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

  private buildSignal(
    activity: WhaleActivity,
    stats: WhaleStats,
  ): CopySignal | null {
    // Confidence: blend whale accuracy + log-scaled volume heuristic
    const volumeBonus = Math.min(0.15, Math.log10(activity.size / 1_000) * 0.05);
    const confidence = stats.accuracy * 0.85 + volumeBonus;

    if (confidence < MIN_CONFIDENCE) {
      logger.debug('[WhaleCopyTrader] Signal skipped — low confidence', {
        wallet: activity.walletAddress.slice(0, 8),
        confidence,
      });
      return null;
    }

    const rawCopy = activity.size * this.copyRatio;
    const copySize = Math.min(rawCopy, this.maxCopyUsdc);
    if (copySize < 1) return null; // too small to bother

    return {
      whale: activity,
      copySize,
      copyRatio: this.copyRatio,
      confidence,
    };
  }

  private publishSignal(signal: CopySignal): void {
    // Paper-trading-orchestrator consumes 'signal.validated' envelopes with
    // `{ original: SignalCandidate }`. We map CopySignal → SignalCandidate shape.
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
        expectedEdge: signal.confidence * 0.10, // ~10% of confidence as edge estimate
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

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

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
