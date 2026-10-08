export interface CommodityContract {
  ticker: string;
  expiryYears: number; // Time to maturity in years (e.g. 0.25 for 3 months)
  futuresPrice: number; // Quoted futures price
}

export interface StorageParameters {
  spotPrice: number;
  financingRatePct: number; // Risk-free financing rate r (e.g. 4.5 for 4.5%)
  storageCostPct: number; // Continuous physical storage cost u (e.g. 2.0 for 2.0%)
}

export interface ConvenienceYieldMetrics {
  ticker: string;
  expiryYears: number;
  futuresPrice: number;
  theoreticalCostOfCarryPrice: number; // S * exp((r + u) * T)
  impliedConvenienceYieldPct: number; // y in %
  regime: 'BACKWARDATION' | 'CONTANGO' | 'PARITY';
}

export interface CalendarSpreadMetrics {
  nearTicker: string;
  farTicker: string;
  nearPrice: number;
  farPrice: number;
  spreadPrice: number; // Far - Near
  annualizedRollYieldPct: number; // (Near - Far) / Near / dT
  cashAndCarryArbAvailable: boolean;
  arbProfitUsdPerUnit: number;
}

export interface SamuelsonVolParams {
  baseVolPct: number; // Long-term baseline vol sigma_0
  decayAlpha: number; // Rate of decay alpha
}
