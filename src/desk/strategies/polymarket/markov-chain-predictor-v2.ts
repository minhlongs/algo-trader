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
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type MarkovChainPredictorConfig,
  DEFAULT_CONFIG,
  discretizeChange,
  buildTransitionMatrix,
  predictNextState,
  pricesToStates,
} from './markov-chain-types';

export type { MarkovChainPredictorConfig } from './markov-chain-types';
export {
  DEFAULT_CONFIG,
  discretizeChange,
  buildTransitionMatrix,
  predictNextState,
  pricesToStates,
} from './markov-chain-types';

const STRATEGY_NAME = 'markov-chain-predictor' as StrategyName;

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
    if (!history) {
      history = [];
      this.priceHistory.set(tokenId, history);
    }
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
        if (prediction.state === 'up') {
          side = 'yes';
        } else if (prediction.state === 'down') {
          side = 'no';
        } else {
          continue;
        }

        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : 1 - ba.bid;

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, parseFloat(this.cfg.positionSize));

        logger.debug('Markov entry', this.strategyName, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          currentState,
          predictedState: prediction.state,
          confidence: prediction.probability.toFixed(4),
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
