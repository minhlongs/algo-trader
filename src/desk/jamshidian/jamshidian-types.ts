export interface CouponCashFlow {
  time: number; // payment time t_i in years
  amount: number; // coupon / principal amount c_i
}

export interface JamshidianParams {
  strike: number; // Strike price K of the option on the coupon bond
  expiry: number; // Option expiry T in years
  shortRate: number; // Initial short rate r_0
  meanReversion: number; // kappa in Vasicek dynamics
  longTermRate: number; // theta in Vasicek dynamics
  volatility: number; // sigma in Vasicek dynamics
  cashFlows: CouponCashFlow[]; // Cash flows of underlying bond occurring after T
  isCall: boolean;
}

export interface JamshidianResult {
  optionPrice: number;
  criticalRate: number; // Critical short rate r* solving sum c_i P(r*, T, t_i) = K
  underlyingBondPrice: number; // Forward coupon bond price at T
  intrinsicValue: number;
}
