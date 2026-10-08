export interface SwapPointSchedule {
  tenorName: string;
  tenorDays: number;
  bidSwapPoints: number;
  askSwapPoints: number;
  outrightBid: number;
  outrightAsk: number;
}

export class FxForwardSwapPricer {
  /**
   * Computes outright forward rates and swap point spreads across multiple tenors
   */
  public generateSwapCurve(
    spotBid: number,
    spotAsk: number,
    domesticBorrowPct: number,
    domesticLendPct: number,
    foreignBorrowPct: number,
    foreignLendPct: number,
    tenors: { name: string; days: number }[]
  ): SwapPointSchedule[] {
    if (spotBid <= 0 || spotAsk <= spotBid) {
      throw new Error('Valid spot bid and ask rates required (spotAsk > spotBid > 0)');
    }

    return tenors.map((tenor) => {
      const t = tenor.days / 360.0;

      // Bid forward: sell foreign currency forward
      // Synthetic: borrow foreign at foreignBorrowPct, invest domestic at domesticLendPct
      const fwdBid = spotBid * ((1 + (domesticLendPct / 100) * t) / (1 + (foreignBorrowPct / 100) * t));

      // Ask forward: buy foreign currency forward
      // Synthetic: borrow domestic at domesticBorrowPct, invest foreign at foreignLendPct
      const fwdAsk = spotAsk * ((1 + (domesticBorrowPct / 100) * t) / (1 + (foreignLendPct / 100) * t));

      const bidSwapPoints = Number(((fwdBid - spotBid) * 10000).toFixed(2));
      const askSwapPoints = Number(((fwdAsk - spotAsk) * 10000).toFixed(2));

      return {
        tenorName: tenor.name,
        tenorDays: tenor.days,
        bidSwapPoints,
        askSwapPoints,
        outrightBid: Number(fwdBid.toFixed(5)),
        outrightAsk: Number(fwdAsk.toFixed(5)),
      };
    });
  }
}
