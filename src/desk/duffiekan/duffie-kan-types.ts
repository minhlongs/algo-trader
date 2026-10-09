export interface DuffieKanParams {
  speedK: number[];
  theta: number[];
  sigma: number[];
  delta0: number;
  delta1: number[];
  stateX: number[];
  maturity: number;
  creditDelta0?: number;
  creditDelta1?: number[];
  recoveryRate?: number;
}

export interface DuffieKanResult {
  bondPrice: number;
  yieldToMaturity: number;
  risklessYield: number;
  creditSpreadBps: number;
  coefficientsA: number;
  coefficientsB: number[];
  defaultablePrice?: number;
}
