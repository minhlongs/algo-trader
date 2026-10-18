export interface Gatheral2006SviInput {
  readonly logMoneyness: number;
  readonly a: number;
  readonly b: number;
  readonly rho: number;
  readonly m: number;
  readonly sigma: number;
  readonly timeToExpiryYears: number;
}

export interface Gatheral2006SviOutput {
  readonly totalImpliedVariance: number;
  readonly impliedVolatility: number;
  readonly rightWingSlope: number;
  readonly leftWingSlope: number;
  readonly durrlemanGValue: number;
  readonly butterflyArbitrageFree: boolean;
  readonly rogerLeeWingBoundSatisfied: boolean;
}
