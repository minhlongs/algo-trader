export interface VenueQuoteSpec {
  readonly venueId: string;
  readonly queueDepthUnits: number;
  readonly expectedOutflowMean: number;
  readonly expectedOutflowStd: number;
  readonly makerRebateBps: number;
  readonly takerFeeBps: number;
  readonly halfSpreadBps: number;
}

export interface ContKukanov2017Input {
  readonly targetQuantity: number;
  readonly underfillPenaltyBps: number;
  readonly overfillPenaltyBps: number;
  readonly venues: readonly VenueQuoteSpec[];
}

export interface VenueAllocationSlice {
  readonly venueId: string;
  readonly limitAllocationUnits: number;
  readonly fillProbability: number;
  readonly expectedNetFeeBps: number;
}

export interface ContKukanov2017Output {
  readonly allocations: readonly VenueAllocationSlice[];
  readonly totalAllocatedUnits: number;
  readonly marketSweepReserveUnits: number;
  readonly weightedFillProbability: number;
  readonly expectedExecutionSavingsBps: number;
  readonly routingRegime: 'PASSIVE_MULTI_VENUE' | 'HYBRID_LIT_SWEEP' | 'URGENT_TAKER_SWEEP';
}
