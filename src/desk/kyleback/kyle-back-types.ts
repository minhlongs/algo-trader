export interface KyleBackParams {
  readonly fundamentalValue: number; // True liquidation value v
  readonly priorMean: number;        // p_0
  readonly priorVariance: number;    // Sigma_0 (variance of fundamental value)
  readonly noiseTraderSigma: number; // sigma_u (diffusion coefficient of uncoordinated order flow)
  readonly timeHorizonYears: number; // T (trading duration until public disclosure)
}

export interface KyleBackSnapshot {
  readonly time: number;
  readonly price: number;
  readonly cumulativeOrderFlow: number;
  readonly informedPosition: number;
  readonly informedTradingRate: number;
  readonly lambda: number;
  readonly residualVariance: number;
}

export interface KyleBackSimulationResult {
  readonly snapshots: KyleBackSnapshot[];
  readonly terminalPriceError: number;
  readonly priceDiscoveryEfficiencyPct: number;
  readonly totalInformedVolume: number;
  readonly totalNoiseVolume: number;
  readonly theoreticalLambda: number;
}
