export type OptionType = 'call' | 'put';

export interface GarmanKohlhagenParams {
  spotRate: number;            // Spot exchange rate S (domestic currency per 1 unit foreign)
  strikeRate: number;          // Strike price K
  timeToMaturity: number;      // Tenor T in years
  domesticRate: number;        // Domestic risk-free rate r_d
  foreignRate: number;         // Foreign risk-free rate r_f
  volatility: number;          // FX annualized volatility sigma
  optionType: OptionType;      // 'call' or 'put'
}

export interface GarmanKohlhagenGreeks {
  delta: number;               // dV / dS
  gamma: number;               // d2V / dS2
  vega: number;                // dV / dsigma (scaled to 1 vol unit = 100%)
  theta: number;               // dV / dt (annual decay)
  domesticRho: number;         // dV / dr_d
  foreignRho: number;          // dV / dr_f
  dualDelta: number;           // -dV / dK
}

export interface GarmanKohlhagenResult {
  price: number;
  d1: number;
  d2: number;
  greeks: GarmanKohlhagenGreeks;
  forwardRate: number;
  paritySpread: number;        // (Call - Put) - (S*exp(-rf*T) - K*exp(-rd*T))
}

export interface FxImpliedVolParams {
  spotRate: number;
  strikeRate: number;
  timeToMaturity: number;
  domesticRate: number;
  foreignRate: number;
  targetPrice: number;
  optionType: OptionType;
  initialVolGuess?: number;
  tolerance?: number;
  maxIterations?: number;
}
