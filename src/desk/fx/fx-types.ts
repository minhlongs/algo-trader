export interface CurrencyRate {
  baseCurrency: string; // e.g. 'EUR'
  quoteCurrency: string; // e.g. 'USD'
  bid: number;
  ask: number;
  timestampMs?: number;
}

export interface TriangularCycle {
  path: string[]; // e.g. ['USD', 'EUR', 'JPY', 'USD']
  multiplier: number; // e.g. 1.00045 (profit = +4.5 bps)
  profitBps: number;
  ratesTraversed: number[];
  executionLegs: {
    from: string;
    to: string;
    rate: number;
    action: 'BUY' | 'SELL';
  }[];
}

export interface CipParameters {
  spotRate: number; // S (e.g. 1.0850 EUR/USD)
  forwardRate: number; // F (e.g. 1.0890)
  domesticRatePct: number; // r_d (e.g. 5.25% USD)
  foreignRatePct: number; // r_f (e.g. 3.75% EUR)
  tenorDays: number; // e.g. 90 days (3M)
}

export interface CipResult {
  theoreticalForward: number;
  marketForward: number;
  forwardPoints: number; // (F - S) * 10000 (pips)
  cipBasisBps: number; // Deviation from CIP in basis points
  arbitrageDirection: 'BORROW_DOMESTIC_LEND_FOREIGN' | 'BORROW_FOREIGN_LEND_DOMESTIC' | 'EQUILIBRIUM';
}
