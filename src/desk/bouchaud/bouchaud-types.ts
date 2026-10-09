export interface BouchaudParams {
  orderSigns: number[];       // array of +1 (buy) and -1 (sell)
  decayExponentBeta: number;  // bare propagator decay \beta > 0
  memoryExponentGamma: number;// empirical sign autocorrelation exponent \gamma \in (0, 1)
  propagatorScale?: number;   // \Gamma_0 > 0
  initialPrice?: number;      // S_0
}

export interface ResponsePoint {
  lag: number;
  signAutocorrelation: number;
  barePropagator: number;
  dressedResponse: number;
}

export type EfficiencyRegime = 'EFFICIENT_DIFFUSIVE' | 'SUBDIFFUSIVE_REVERSAL' | 'SUPERDIFFUSIVE_TRENDING';

export interface BouchaudResult {
  efficiencyRegime: EfficiencyRegime;
  diffusiveCancellationError: number; // |\beta - (1 - \gamma)/2|
  isArbitrageFree: boolean;
  cumulativePriceImpact: number;
  responseCurve: ResponsePoint[];
}
