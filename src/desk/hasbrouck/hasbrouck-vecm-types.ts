/**
 * Joel Hasbrouck (1991) VAR / VECM Empirical Microstructure Model Types.
 * "Measuring the Information Content of Stock Trades", Journal of Finance, 46(1):179-207.
 * Strictly < 180 LOC, zero :any types.
 */

export interface HasbrouckTradeObservation {
  readonly timestamp: number;
  readonly midpointReturn: number; // r_t = q_t - q_{t-1} or ln(q_t / q_{t-1})
  readonly signedVolume: number;   // x_t = sign(trade) * volume (or sign only: +1 / -1)
}

export interface HasbrouckVarConfig {
  readonly lagOrder: number; // K lags (e.g. 1 to 10)
  readonly ridgePenalty?: number; // Ridge regularizer lambda >= 0 for stability
}

export interface HasbrouckVarCoefficients {
  readonly alphaLagMidpoint: readonly number[]; // a_1, ..., a_K
  readonly alphaLagSignedTrade: readonly number[]; // b_1, ..., b_K
  readonly betaLagMidpoint: readonly number[]; // c_1, ..., c_K
  readonly betaLagSignedTrade: readonly number[]; // d_1, ..., d_K
  readonly interceptMidpoint: number;
  readonly interceptTrade: number;
}

export interface HasbrouckResiduals {
  readonly midpointInnovations: readonly number[]; // v_1,t
  readonly tradeInnovations: readonly number[];    // v_2,t
  readonly sigma1Sq: number; // Var(v_1)
  readonly sigma2Sq: number; // Var(v_2)
  readonly cov12: number;    // Cov(v_1, v_2)
}

export interface HasbrouckImpulseResponseStep {
  readonly horizon: number; // Step tau = 0, 1, 2, ...
  readonly tradeShockToReturn: number; // Response of r_{t+tau} to unit x_t shock
  readonly tradeShockToQuote: number;  // Cumulative quote impact: sum_{s=0}^tau r_s
  readonly quoteShockToReturn: number; // Response of r_{t+tau} to unit quote innovation
  readonly quoteShockToQuote: number;  // Cumulative quote impact of quote innovation
}

export interface HasbrouckVarianceDecomposition {
  readonly totalRandomWalkVariance: number; // sigma_w^2
  readonly tradeInformationVariance: number; // sigma_{w,x}^2
  readonly quoteInformationVariance: number; // sigma_{w,v}^2
  readonly informationShare: number; // R_w^2 = sigma_{w,x}^2 / sigma_w^2 in [0, 1]
  readonly permanentPriceImpact: number; // Long-run price impact per unit trade shock (gamma_infty)
}

export interface HasbrouckVecmAnalysisResult {
  readonly config: HasbrouckVarConfig;
  readonly sampleSize: number;
  readonly coefficients: HasbrouckVarCoefficients;
  readonly residuals: HasbrouckResiduals;
  readonly impulseResponses: readonly HasbrouckImpulseResponseStep[];
  readonly varianceDecomposition: HasbrouckVarianceDecomposition;
}
