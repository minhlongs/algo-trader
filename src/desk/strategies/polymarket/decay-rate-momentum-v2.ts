/**
 * Decay Rate Momentum V2 — extends BasePolymarketStrategy.
 *
 * Measures the rate at which price momentum decays. Fast decay → fade the
 * spike (counter-trend). Slow decay → genuine trend (follow it).
 * Uses exponential decay curve fitting on multi-window momentum measurements.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ───────────────────────────────────────────────────────────────────

export interface DecayRateMomentumConfig extends BaseStrategyConfig {
  lookbackWindows: number[];
  slowDecayThreshold: number;
  fastDecayThreshold: number;
  minMomentumAbs: number;
  priceWindow: number;
}

export const DEFAULT_CONFIG: DecayRateMomentumConfig = {
  lookbackWindows: [3, 5, 10, 15],
  slowDecayThreshold: 0.05,
  fastDecayThreshold: 0.2,
  minMomentumAbs: 0.01,
  priceWindow: 20,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '12',
};

const STRATEGY_NAME = 'decay-rate-momentum' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcMomentumAtWindow(prices: number[], window: number): number {
  if (prices.length < window || window <= 0) return 0;
  const reference = prices[prices.length - window];
  if (reference === 0) return 0;
  const last = prices[prices.length - 1];
  return (last - reference) / reference;
}

export function estimateDecayRate(momentums: number[]): number {
  if (momentums.length < 2) return 0;
  const first = momentums[0];
  const last = momentums[momentums.length - 1];
  if (first === 0) return 0;
  const ratio = last / first;
  if (ratio <= 0) return 0;
  const lambda = -Math.log(ratio) / (momentums.length - 1);
  if (lambda < 0) return 0;
  if (lambda > 1) return 1;
  return lambda;
}

export function classifyDecay(
  lambda: number,
  slowThreshold: number,
  fastThreshold: number,
): 'slow' | 'fast' | 'neutral' {
  if (lambda < slowThreshold) return 'slow';
  if (lambda > fastThreshold) return 'fast';
  return 'neutral';
}

export function determineSignal(
  decayClass: string,
  latestMomentum: number,
): 'yes' | 'no' | null {
  if (decayClass === 'slow') return latestMomentum > 0 ? 'yes' : 'no';
  if (decayClass === 'fast') return latestMomentum > 0 ? 'no' : 'yes';
  return null;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class DecayRateMomentumStrategy extends BasePolymarketStrategy {
  private readonly cfg: DecayRateMomentumConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<DecayRateMomentumConfig> = {}) {
    const fullConfig: DecayRateMomentumConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) {
      history = [];
      this.priceHistory.set(tokenId, history);
    }
    history.push(price);
    if (history.length > this.cfg.priceWindow) {
      history.splice(0, history.length - this.cfg.priceWindow);
    }
  }

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

        this.recordPrice(market.yesTokenId, ba.mid);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];

        const maxWindow = Math.max(...this.cfg.lookbackWindows);
        if (prices.length < maxWindow) continue;

        const momentums: number[] = [];
        for (const window of this.cfg.lookbackWindows) {
          momentums.push(calcMomentumAtWindow(prices, window));
        }

        const latestMomentum = momentums[0];
        if (Math.abs(latestMomentum) < this.cfg.minMomentumAbs) continue;

        const absMomentums = momentums.map(m => Math.abs(m));
        const lambda = estimateDecayRate(absMomentums);
        const decayClass = classifyDecay(lambda, this.cfg.slowDecayThreshold, this.cfg.fastDecayThreshold);

        const signal = determineSignal(decayClass, latestMomentum);
        if (signal === null) continue;

        const side: 'yes' | 'no' = signal;
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Decay momentum entry', this.strategyName, {
          lambda: lambda.toFixed(4),
          decayClass,
          latestMomentum: latestMomentum.toFixed(4),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface DecayRateMomentumDeps extends StrategyDeps {
  config?: Partial<DecayRateMomentumConfig>;
}

export function createDecayRateMomentumTick(deps: DecayRateMomentumDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new DecayRateMomentumStrategy(baseDeps, config);
  return strategy.toTickFn();
}
