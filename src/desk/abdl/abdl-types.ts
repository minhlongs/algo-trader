/**
 * Phase / Wave 204: Andersen-Bollerslev-Diebold-Labys (2003) & Corsi (2009) HAR-RV Framework.
 * Heterogeneous Autoregressive model of Realized Volatility across multi-scale horizons.
 * Strictly < 150 LOC, zero :any types.
 */

export interface IntradayReturnSample {
  readonly timestamp: number;
  readonly return: number; // Log return r_{t,i}
}

export interface DailyRealizedMetrics {
  readonly dateIndex: number;
  readonly realizedVariance: number; // RV_t = sum(r_{t,i}^2)
  readonly bipowerVariation: number; // BV_t = mu_1^{-2} sum(|r_{t,i}| * |r_{t,i-1}|)
  readonly continuousVariance: number; // C_t = min(RV_t, BV_t)
  readonly jumpVariance: number; // J_t = max(RV_t - BV_t, 0)
}

export interface HarHorizons {
  readonly dailyLag: number; // Horizon 1 day (RV^(d))
  readonly weeklyLag: number; // Horizon 5 days (RV^(w))
  readonly monthlyLag: number; // Horizon 22 days (RV^(m))
}

export interface HarObservationRow {
  readonly targetRv: number; // RV_{t+1}
  readonly rvDaily: number; // RV_t^(d)
  readonly rvWeekly: number; // RV_t^(w)
  readonly rvMonthly: number; // RV_t^(m)
  readonly jumpDaily?: number; // J_t^(d) optional for HAR-J
}

export interface HarRegressionCoefficients {
  readonly beta0: number; // Constant intercept
  readonly betaDaily: number; // beta_d
  readonly betaWeekly: number; // beta_w
  readonly betaMonthly: number; // beta_m
  readonly betaJump?: number; // beta_j (if HAR-J)
  readonly rSquared: number;
  readonly residualVariance: number;
}

export interface HarForecastResult {
  readonly predictedRv: number;
  readonly predictedVolatility: number; // sqrt(predictedRv)
  readonly horizonDays: number;
  readonly coefficients: HarRegressionCoefficients;
  readonly mincerZarnowitzR2: number;
  readonly rmse: number;
  readonly mae: number;
}
