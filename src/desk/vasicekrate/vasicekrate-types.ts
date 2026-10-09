export interface VasicekParams {
  currentRate: number; // r_0
  meanReversionSpeed: number; // k (kappa > 0)
  longTermMeanRate: number; // theta
  volatility: number; // sigma > 0
}

export interface VasicekZeroBondResult {
  maturity: number; // T
  price: number; // P(0, T)
  yieldRate: number; // y(0, T) = -ln(P) / T
  forwardRate: number; // f(0, T)
  yieldVolatility: number; // sigma_y(T) = sigma * B(T) / T
}

export interface VasicekTermStructureResult {
  curve: VasicekZeroBondResult[];
  longTermAsymptoticYield: number; // r_infinity = theta - sigma^2 / (2 * k^2)
}
