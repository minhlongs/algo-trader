export interface OuCalibratedParameters {
  readonly speedOfMeanReversionTheta: number; // theta > 0
  readonly longTermMeanMu: number;            // mu
  readonly volatilitySigma: number;           // sigma > 0
  readonly halfLifeDays: number;              // ln(2) / theta
  readonly stationaryVariance: number;        // sigma^2 / (2 * theta)
}

export interface OuStoppingBands {
  readonly upperExitLevel: number;            // Exit long or enter short
  readonly lowerExitLevel: number;            // Exit short or enter long
  readonly entryThresholdStdDev: number;      // Threshold in units of stationary standard deviation
  readonly zScoreCurrent: number;             // (x_current - mu) / stationaryStdDev
  readonly tradeSignal: 'ENTER_LONG' | 'ENTER_SHORT' | 'EXIT_SPREAD' | 'HOLD';
}
