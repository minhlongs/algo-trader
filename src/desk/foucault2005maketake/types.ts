export interface Foucault2005MakeTakeInput {
  readonly currentSpreadBps: number;
  readonly tickSizeBps: number;
  readonly orderArrivalRatePerSec: number;
  readonly waitingCostBpsPerSec: number;
  readonly proportionPatientTraders: number;
  readonly makerRebateBps: number;
  readonly takerFeeBps: number;
}

export interface Foucault2005MakeTakeOutput {
  readonly cutoffSpreadBps: number;
  readonly expectedTimeToFillSec: number;
  readonly expectedWaitingCostBps: number;
  readonly netMakeAdvantageBps: number;
  readonly resiliencyRatePerSec: number;
  readonly optimalAction: 'LIMIT_MAKE_IMPROVE' | 'LIMIT_MAKE_JOIN' | 'MARKET_TAKE_IMMEDIATE';
}
