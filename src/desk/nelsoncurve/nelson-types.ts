export interface NelsonSvenssonParams {
  beta0: number; // Long-term level
  beta1: number; // Short-term component
  beta2: number; // Medium-term curvature / hump 1
  beta3: number; // Second curvature / hump 2 (Svensson extension)
  tau1: number;  // First scale/decay parameter (> 0)
  tau2: number;  // Second scale/decay parameter (> 0)
}

export interface CurveTenorPoint {
  maturity: number; // In years (e.g., 0.25, 0.5, 1, 2, 5, 10, 30)
  zeroRate: number; // Continuously compounded spot zero rate
  discountFactor: number; // P(0, t) = exp(-zeroRate * t)
  instantaneousForward: number; // f(t) = -d/dt ln P(0, t)
}

export interface CreditCurveSpreadPoint {
  maturity: number;
  benchmarkZeroRate: number;
  creditZeroRate: number;
  creditSpreadBps: number;
  hazardRate: number; // implied instantaneous default intensity (bps / (1 - R))
  survivalProbability: number; // Q(t) = exp(-integral of hazard)
}

export interface NelsonSvenssonResult {
  params: NelsonSvenssonParams;
  spotPoints: CurveTenorPoint[];
  asymptoticRate: number; // beta0
  shortRate: number; // beta0 + beta1
}
