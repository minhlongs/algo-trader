/**
 * Markov Chain Matrix and State Transition Estimator
 *
 * @module desk/strategies/polymarket/markov-chain-types
 */

import type { BaseStrategyConfig } from './base-polymarket-strategy';

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
    if (!row) {
      row = new Map<string, number>();
      counts.set(from, row);
    }
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
  matrix: Map<string, Map<string, number>>,
  currentState: string,
): { state: string; probability: number } | null {
  const row = matrix.get(currentState);
  if (!row || row.size === 0) return null;

  let bestState = '',
    bestProb = -1;
  for (const [state, prob] of row) {
    if (prob > bestProb) {
      bestProb = prob;
      bestState = state;
    }
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
