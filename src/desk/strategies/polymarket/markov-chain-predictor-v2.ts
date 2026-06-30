/**
 * Markov Chain Predictor V2 — extends BasePolymarketStrategy.
 *
 * Models price movements as a discrete Markov chain (up/down/flat states).
 * Estimates transition probabilities from recent history, then predicts the
 * most likely next state. Trades when the predicted state has high confidence.
 *
 * P(next=up | current_state) > confidence → BUY YES.
 * P(next=down | current_state) > confidence → BUY NO.
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

export interface MarkovChainPredictorConfig extends BaseStrategyConfig {
  stateThreshold: number;
  historyWindow: number;
  confidenceThreshold: number;
}

export const DEFAULT_CONFIG: MarkovChainPredictorConfig = {
  stateThreshold: 0.005,
  historyWindow: 30,
  confidenceThreshold: 0.6,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'markov-chain-predictor' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function discretizeChange(change: number, threshold: number): 'up' | 'down' | 'flat' {
  if (change > threshold) return 'up';
  if (change < -threshold) return 'down';
  return 'flat';
}

export function buildTransitionMatrix(states: string[]): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>();

  for (let i = 0; i < states.length - 1; i++) {
    const from = states[i];
    const to = states[i + 1];

    let row = counts.get(from);
    if (!row) { row = new Map<string, number>(); counts.set(from, row); }
    row.set(to, (row.get(to) ?? 0) + 1);
  }

  const matrix = new Map<string, Map<string, number>>();
  for (const [from, row] of counts) {
    let total = 0;
    for (const count of row.values()) total += count;

    const probRow = new Map<string, number>();
    for (const [to, count] of row) {
      probRow.set(to, total > 0 ? count / total : 0);
    }
    matrix.set(from, probRow);
  }

  return matrix;
}

export function predictNextState(
  matrix: Map<string, Map<string, number>>, currentState: string,
): { state: string; probability: number } | null {
  const row = matrix.get(currentState);
  if (!row || row.size === 0) return null;

  let bestState = '', bestProb = -1;
  for (const [state, prob] of row) {
    if (prob > bestProb) { bestProb = prob; bestState = state; }
  }

  if (bestProb < 0) return null;
  return { state: bestState, probability: bestProb };
}

export function pricesToStates(prices: number[], threshold: number): string[] {
  const states: string[] = [];
  for (let i = 1; i < prices.length; i++) {
    states.push(discretizeChange(prices[i] - prices[i - 1], threshold));
  }
  return states;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class MarkovChainPredictorStrategy extends BasePolymarketStrategy {
  private readonly cfg: MarkovChainPredictorConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<MarkovChainPredictorConfig> = {}) {
    const fullConfig: MarkovChainPredictorConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    const maxLen = this.cfg.historyWindow + 1;
    if (history.length > maxLen) {
      history.splice(0, history.length - maxLen);
    }
  }

  private getPrices(tokenId: string): number[] {
    return this.priceHistory.get(tokenId) ?? [];
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
        const prices = this.getPrices(market.yesTokenId);
        if (prices.length < 3) continue;

        const states = pricesToStates(prices, this.cfg.stateThreshold);
        if (states.length < 2) continue;

        const matrix = buildTransitionMatrix(states);
        const currentState = states[states.length - 1];
        const prediction = predictNextState(matrix, currentState);
        if (!prediction || prediction.probability < this.cfg.confidenceThreshold) continue;

        let side: 'yes' | 'no';
        if (prediction.state === 'up') { side = 'yes'; }
        else if (prediction.state === 'down') { side = 'no'; }
        else { continue; }

        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Markov entry', this.strategyName, {
          conditionId: market.conditionId, side,
          entryPrice: entryPrice.toFixed(4),
          currentState, predictedState: prediction.state,
          confidence: prediction.probability.toFixed(4),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface MarkovChainPredictorDeps extends StrategyDeps {
  config?: Partial<MarkovChainPredictorConfig>;
}

export function createMarkovChainPredictorTick(
  deps: MarkovChainPredictorDeps,
): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new MarkovChainPredictorStrategy(baseDeps, config);
  return strategy.toTickFn();
}
