/**
 * Pure scenario sizer and simulation helpers for Kelly vs Fixed backtest.
 */

import { KellyPositionSizer } from '../kelly-position-sizer';
import {
  SeededRandom,
  simulateTrades,
  type PositionSizerFn,
  type ScenarioResult,
} from './kelly-backtest-simulation';

export function createFixed2PercentSizer(): PositionSizerFn {
  return (portfolio) => portfolio * 0.02;
}

export function createKellyCorrelationSizer(
  kellySizer: KellyPositionSizer,
  winProbability: number,
  winLossRatio: number,
  correlation: number,
): PositionSizerFn {
  return (portfolio: number, _tradeIndex: number): number => {
    const result = kellySizer.calculatePositionSize({
      winProbability,
      winLossRatio,
      portfolioValue: portfolio,
      correlation,
    });
    return result.positionSizeUsd;
  };
}

export function runSingleScenarioSimulation(
  name: string,
  initialBankroll: number,
  numTrades: number,
  winProbability: number,
  winLossRatio: number,
  sizer: PositionSizerFn,
  randomSeed: number,
): ScenarioResult {
  const rng = new SeededRandom(randomSeed);
  return {
    name,
    metrics: simulateTrades(
      initialBankroll,
      numTrades,
      winProbability,
      winLossRatio,
      sizer,
      rng,
    ),
  };
}
