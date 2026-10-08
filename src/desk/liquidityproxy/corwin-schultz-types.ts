export interface CorwinSchultzParams {
  highDay1: number;
  lowDay1: number;
  highDay2: number;
  lowDay2: number;
}

export interface CorwinSchultzMetrics {
  gamma: number;     // Sum of squared log H/L for individual days
  beta: number;      // Squared log H/L for the 2-day period
  alpha: number;     // CS alpha parameter
  spread: number;    // Estimated bid-ask spread (decimal form, not price form)
  isValid: boolean;  // True if estimation didn't hit numerical boundary
}
