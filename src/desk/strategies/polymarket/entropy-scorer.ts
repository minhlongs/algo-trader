/**
 * Entropy Scorer Strategy — V2 implementation.
 *
 * Scores market uncertainty using information entropy derived from
 * order book probabilities. Trades when entropy indicates mispricing:
 * low entropy = high consensus (follow consensus direction),
 * high entropy = uncertainty (avoid or exit).
 *
 * Entry: entropy below threshold with clear directional bias
 * Exit: entropy rises above threshold (uncertainty returns)
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import type { OpenPosition } from './base-polymarket-strategy';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface EntropyScorerConfig extends BaseStrategyConfig {
  /** Entropy threshold (0-1) below which we consider a signal reliable */
  entropyThreshold: number;
  /** Minimum directional bias (0-1) to confirm signal */
  minBias: number;
  /** Lookback ticks for tracking entropy history */
  lookback: number;
}

export const DEFAULT_CONFIG: EntropyScorerConfig = {
  entropyThreshold: 0.7,
  minBias: 0.15,
  lookback: 5,
  minVolume: 1000,
  takeProfitPct: 0.04,
  stopLossPct: 0.025,
  maxHoldMs: 10 * 60_000,
  maxPositions: 4,
  cooldownMs: 60_000,
  positionSize: '12',
};

const STRATEGY_NAME: StrategyName = 'entropy-scorer';

// ── Pure helpers ───────────────────────────────────────────────────────────────

/**
 * Compute Shannon entropy from a probability distribution.
 * entropy(p) = -(p * ln(p) + (1-p) * ln(1-p)) / ln(2)
 * Returns 0 (certain) to 1 (maximum uncertainty).
 */
export function computeEntropy(probability: number): number {
  const p = Math.max(0.001, Math.min(0.999, probability));
  const q = 1 - p;
  const entropy = -(p * Math.log(p) + q * Math.log(q)) / Math.LN2;
  return Math.min(1, entropy);
}

/** Directional bias: how far from 0.5 (neutral). 0 = neutral, 1 = max bias. */
export function computeBias(probability: number): number {
  return Math.abs(probability - 0.5) * 2;
}

/** Determine trade direction from probability bias. */
export function getDirection(probability: number): 'yes' | 'no' | null {
  const bias = computeBias(probability);
  if (bias < 0.05) return null;
  return probability > 0.5 ? 'yes' : 'no';
}

// ── Strategy class ─────────────────────────────────────────────────────────────

export class EntropyScorerStrategy extends BasePolymarketStrategy {
  private readonly cfg: EntropyScorerConfig;
  private readonly entropyHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<EntropyScorerConfig> = {}) {
    const fullConfig: EntropyScorerConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  // ── Custom exit: entropy rise ──────────────────────────────────────────

  protected getCustomExitCondition(
    pos: OpenPosition,
    currentPrice: number,
  ): { exit: boolean; reason: string } {
    const entropy = computeEntropy(pos.side === 'yes' ? currentPrice : 1 - currentPrice);
    if (entropy > this.cfg.entropyThreshold) {
      return { exit: true, reason: `entropy-rising (${entropy.toFixed(2)})` };
    }
    return { exit: false, reason: '' };
  }

  // ── Entry scanning ─────────────────────────────────────────────────────

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        // Track entropy history
        let hist = this.entropyHistory.get(market.conditionId);
        if (!hist) {
          hist = [];
          this.entropyHistory.set(market.conditionId, hist);
        }
        const currentEntropy = computeEntropy(ba.mid);
        hist.push(currentEntropy);
        if (hist.length > this.cfg.lookback * 3) hist.splice(0, hist.length - this.cfg.lookback * 3);

        // Need enough entropy history to confirm trend
        if (hist.length < 3) continue;

        // Check: entropy falling (consensus forming) + clear directional bias
        const recentEntropy = hist.slice(-3).reduce((s, v) => s + v, 0) / 3;
        if (recentEntropy > this.cfg.entropyThreshold) continue;

        const bias = computeBias(ba.mid);
        if (bias < this.cfg.minBias) continue;

        const dir = getDirection(ba.mid);
        if (!dir) continue;

        const tokenId = dir === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = dir === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        await this.enterPosition(
          tokenId,
          market.conditionId,
          dir,
          entryPrice,
          parseFloat(this.cfg.positionSize),
        );

        logger.debug('Entropy entry', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side: dir,
          entropy: recentEntropy.toFixed(3),
          bias: bias.toFixed(3),
        });
      } catch (err) {
        logger.debug('Entropy scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory ─────────────────────────────────────────────────────────────

export function createEntropyScorerTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new EntropyScorerStrategy(deps);
  return strategy.toTickFn();
}
