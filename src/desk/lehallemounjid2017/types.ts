/**
 * Wave 257: Lehalle & Mounjid (2017) Optimal Execution Limit Orders Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface LehalleMounjid2017Config {
  readonly baseFillIntensityA: number;
  readonly queueDecayK: number;
  readonly adverseJumpHazardTheta: number;
  readonly jumpSeverityDeltaP: number;
  readonly riskAversionGamma: number;
  readonly inventoryQ: number;
  readonly maxQueueDistance?: number;
}

export interface LehalleMounjid2017Result {
  readonly optimalQueueDistance: number;
  readonly optimalFillIntensity: number;
  readonly adverseSelectionCost: number;
  readonly effectiveCaptureSpread: number;
  readonly adverseExecutionProbability: number;
  readonly netExpectedUtility: number;
}
