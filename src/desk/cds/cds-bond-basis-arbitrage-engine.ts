import {
  CdsContractQuote,
  CashBondQuote,
  CdsBondBasisMetrics,
} from './cds-types';

export class CdsBondBasisArbitrageEngine {
  /**
   * Computes CDS-Bond basis:
   * ASW Spread = Bond YTM - Benchmark Swap Rate
   * Basis = CDS Spread - ASW Spread
   * Negative Basis Trade: Buy Bond, Buy CDS Protection (locks in ASW - CDS spread)
   */
  public evaluateBasis(
    cds: CdsContractQuote,
    bond: CashBondQuote
  ): CdsBondBasisMetrics {
    const aswSpreadBps = bond.yieldToMaturityBps - bond.benchmarkSwapRateBps;
    const basisBps = cds.parSpreadBps - aswSpreadBps;

    // Negative basis occurs when ASW > CDS spread (Basis < 0)
    const isNegativeBasis = basisBps < -5.0; // Margin threshold 5 bps

    // Net carry in basis points when funded via repo: (ASW - CDS) - Repo Haircut/Spread
    const netCarrySpreadBps = aswSpreadBps - cds.parSpreadBps - bond.repoFinancingRateBps;

    // Profit on $10,000,000 notional: 1 bp = $1,000/yr
    const annualProfit = Math.max(0, (netCarrySpreadBps * 1000.0));

    return {
      referenceEntity: cds.referenceEntity,
      cdsSpreadBps: cds.parSpreadBps,
      assetSwapSpreadBps: aswSpreadBps,
      basisBps,
      isNegativeBasisArbitrage: isNegativeBasis && netCarrySpreadBps > 0,
      netCarrySpreadBps,
      annualArbitrageProfitUsdPer10M: Number(annualProfit.toFixed(2)),
    };
  }
}
