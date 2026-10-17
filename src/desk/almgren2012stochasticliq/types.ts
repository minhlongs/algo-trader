/**
 * Wave 280 — Almgren (2012): Optimal Trading with Stochastic Liquidity and Volatility
 * Types & Configuration Interfaces
 */

export interface Almgren2012StochasticLiqConfig {
  readonly initialInventoryQ0: number;
  readonly horizonSec: number;
  readonly steps: number;
  readonly meanTemporaryImpactEtaBar: number;
  readonly liquidityReversionKappa: number;
  readonly riskAversionLambda: number;
  readonly volatilitySigma: number;
  readonly realizedEtaPath: readonly number[];
}

export interface StochasticLiqStep {
  readonly step: number;
  readonly timeSec: number;
  readonly inventory: number;
  readonly currentEta: number;
  readonly optimalTradingRate: number;
  readonly liquidityUrgencyFactor: number;
}

export interface Almgren2012StochasticLiqResult {
  readonly trajectory: readonly StochasticLiqStep[];
  readonly totalExecutionCost: number;
  readonly staticAlmgrenBenchmarkCost: number;
  readonly costSavingsBps: number;
}
