/**
 * Wave 274 — Gatheral, Jaisson & Rosenbaum (2018): Volatility is Rough
 * Types & Configuration Interfaces
 */

export interface GatheralJaisson2018Config {
  readonly logVolatilitySeries: readonly number[];
  readonly lagSteps: readonly number[];
  readonly momentOrderQ: number;
  readonly forecastHorizonSteps: number;
}

export interface ScalingMomentPoint {
  readonly lagDelta: number;
  readonly logDelta: number;
  readonly absoluteMomentMq: number;
  readonly logMq: number;
}

export interface GatheralJaisson2018Result {
  readonly estimatedHurstExponent: number;
  readonly scalingPoints: readonly ScalingMomentPoint[];
  readonly isRoughRegime: boolean;
  readonly forecastedVolatility: number;
}
