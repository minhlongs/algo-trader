export interface NssParameters {
  beta0: number; // Long-term level
  beta1: number; // Short-term component
  beta2: number; // Medium-term humping 1
  beta3: number; // Medium-term humping 2
  tau1: number; // Decay factor 1 (> 0)
  tau2: number; // Decay factor 2 (> 0)
}

export interface BondSpecification {
  id: string;
  couponRatePct: number; // e.g. 4.125 for 4.125%
  maturityYears: number; // e.g. 9.8 years
  cleanPrice: number; // Quoted clean price, e.g. 99.25
  accruedInterest: number; // Accrued interest to settlement, e.g. 0.85
  conversionFactor: number; // Delivery conversion factor, e.g. 0.8842
  accruedAtDelivery: number; // Accrued interest at delivery date
}

export interface FuturesSpecification {
  contractCode: string; // e.g. 'ZN' (10Y Note)
  futuresPrice: number; // Quoted futures price, e.g. 110.50
  daysToDelivery: number; // Days to contract delivery settlement
  repoRatePct: number; // Benchmark repo borrowing rate (e.g. 5.0 for 5.0%)
}

export interface BasisMetrics {
  bondId: string;
  grossBasis: number; // Clean Price - Futures * CF
  netBasis: number; // Gross Basis - Carry (Net basis after funding/coupon)
  impliedRepoRatePct: number; // Annualized IRR
  conversionFactor: number;
  deliveryInvoicePrice: number; // Futures * CF + Accrued_delivery
  dirtyPrice: number; // Clean Price + Accrued
}

export interface CtdRankingResult {
  cheapestBondId: string;
  maxIrrBondId: string;
  rankings: BasisMetrics[];
}
