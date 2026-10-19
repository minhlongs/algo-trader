export interface AlfonsiParams {
  initialPrice: number;       // S_0 fundamental mid-price
  totalQuantity: number;      // Total shares X_0 to execute (e.g. 100,000)
  tradingHorizon: number;     // Horizon T in time units (e.g. 1.0 day or 60 min)
  numIntervals: number;       // Number of execution steps N >= 2
  shapeDelta: number;         // LOB shape power parameter delta >= 0 (0 = flat density)
  depthAlpha: number;         // LOB depth density coefficient alpha > 0
  resilienceRate: number;     // Exponential recovery rate rho > 0
  customSchedule?: number[];  // Optional custom trading schedule [x_0..x_{N-1}]
}

export interface ExecutionSlice {
  step: number;
  quantity: number;
  preTradePriceShift: number;
  postTradePriceShift: number;
  averageExecutionPrice: number;
  cashSpent: number;
}

export interface AlfonsiResult {
  initialPrice: number;
  totalQuantity: number;
  tradingHorizon: number;
  numIntervals: number;
  shapeDelta: number;
  depthAlpha: number;
  resilienceRate: number;
  totalCashSpent: number;
  averageExecutionPrice: number;
  terminalPriceShift: number;
  twapTotalCost: number;
  costSavingsVsTwap: number;
  slices: ExecutionSlice[];
}
