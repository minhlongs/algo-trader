/**
 * Dupire (1994) Continuous Local Volatility Surface Types.
 * Seminal Paper: Bruno Dupire (1994), "Pricing with a Smile", Risk Magazine.
 * Strictly < 180 LOC, zero :any types.
 */

export interface DupireMarketParams {
  readonly spot: number;
  readonly riskFreeRate: number;
  readonly dividendYield: number;
}

export interface OptionQuote {
  readonly strike: number;
  readonly expiry: number; // in years
  readonly price: number; // Call price
  readonly impliedVol?: number;
}

export interface DupireDerivatives {
  readonly dCdT: number;
  readonly dCdK: number;
  readonly d2CdK2: number;
  readonly numerator: number;
  readonly denominator: number;
}

export type ArbitrageType = 'CALENDAR_SPREAD' | 'BUTTERFLY_DENSITY' | 'NEGATIVE_VARIANCE';

export interface ArbitrageViolation {
  readonly strike: number;
  readonly expiry: number;
  readonly type: ArbitrageType;
  readonly message: string;
  readonly value: number;
}

export interface LocalVolPoint {
  readonly strike: number;
  readonly expiry: number;
  readonly localVol: number;
  readonly localVariance: number;
  readonly riskNeutralDensity: number;
  readonly hasArbitrage: boolean;
}

export interface DupireSurfaceResult {
  readonly points: readonly LocalVolPoint[];
  readonly violations: readonly ArbitrageViolation[];
  readonly minLocalVol: number;
  readonly maxLocalVol: number;
  readonly meanLocalVol: number;
  readonly isArbitrageFree: boolean;
}

export type VolatilitySurfaceFunction = (strike: number, expiry: number) => number;
