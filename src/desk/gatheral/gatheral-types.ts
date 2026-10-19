export type KernelType = 'exponential' | 'power-law';

export interface GatheralKernelParams {
  kernelType: KernelType;
  gamma: number;           // Initial kernel scale gamma > 0
  decayParam: number;      // rho > 0 (exponential) or alpha > 0 (power-law)
  timeScale?: number;      // tau_0 > 0 (for power-law, default 1.0)
}

export interface GatheralParams {
  initialPrice: number;    // S_0 > 0
  totalQuantity: number;   // X > 0 (total shares to buy/liquidate)
  tradingHorizon: number;  // T > 0 (in hours or days)
  numSteps: number;        // N intervals (>= 2)
  impactPower?: number;    // delta in (0, 1] (1.0 = linear, 0.5 = square root)
  impactCoeff?: number;    // lambda > 0
  kernel: GatheralKernelParams;
  customSchedule?: number[]; // Optional custom trading speeds or quantities
}

export interface ExecutionStep {
  step: number;
  time: number;
  quantity: number;
  rate: number;
  accumulatedImpact: number;
  executionPrice: number;
  cost: number;
}

export interface GatheralResult {
  params: GatheralParams;
  totalCost: number;
  averageExecutionPrice: number;
  slippageVsInitial: number;
  terminalImpact: number;
  roundTripPnL: number;    // Profit/Loss of standard buy-fast sell-slow round-trip
  hasDynamicArbitrage: boolean; // True if round-trip PnL > 1e-6
  steps: ExecutionStep[];
}
