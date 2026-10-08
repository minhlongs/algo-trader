export interface SmilePoint {
  readonly strike: number;
  readonly callPrice: number;
  readonly totalVarianceW: number; // w = sigma^2 * T
}

export interface CalendarSpreadPoint {
  readonly expiryYears: number;
  readonly totalVarianceW: number;
}

export interface ArbitrageViolation {
  readonly type: 'CALENDAR_SPREAD' | 'BUTTERFLY_SPREAD_NEGATIVE_DENSITY';
  readonly locationDescription: string;
  readonly severityMetric: number;
}

export interface SmileRepairResult {
  readonly originalPoints: SmilePoint[];
  readonly repairedPoints: SmilePoint[];
  readonly violationsFound: ArbitrageViolation[];
  readonly isArbitrageFree: boolean;
}
