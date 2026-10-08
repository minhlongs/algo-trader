import { BondSpecification, FuturesSpecification, BasisMetrics } from './fixedincome-types';

export class BondFuturesBasisEngine {
  /**
   * Computes gross basis, net basis (carry-adjusted), and Implied Repo Rate (IRR)
   */
  public calculateBasis(bond: BondSpecification, futures: FuturesSpecification): BasisMetrics {
    const dirtyPrice = bond.cleanPrice + bond.accruedInterest;
    const deliveryInvoicePrice = futures.futuresPrice * bond.conversionFactor + bond.accruedAtDelivery;

    // Gross Basis = Clean Price - (Futures Price * CF)
    const grossBasis = bond.cleanPrice - futures.futuresPrice * bond.conversionFactor;

    // Time to delivery in years (act/360 or act/365 convention)
    const dtYears = futures.daysToDelivery / 360.0;

    // Financing cost = Dirty Price * Repo Rate * (Days / 360)
    const financingCost = dirtyPrice * (futures.repoRatePct / 100.0) * dtYears;

    // Coupon accrued earned during holding period = AccruedAtDelivery - AccruedNow
    const couponEarned = bond.accruedAtDelivery - bond.accruedInterest;

    // Net Carry = Coupon Earned - Financing Cost
    const netCarry = couponEarned - financingCost;

    // Net Basis = Gross Basis - Net Carry
    const netBasis = grossBasis - netCarry;

    // Implied Repo Rate (IRR):
    // IRR = (Delivery Invoice Price - Dirty Price) / Dirty Price * (360 / Days) * 100%
    const irrPct = dtYears > 0 ? ((deliveryInvoicePrice - dirtyPrice) / dirtyPrice) * (1.0 / dtYears) * 100.0 : 0;

    return {
      bondId: bond.id,
      grossBasis: Number(grossBasis.toFixed(4)),
      netBasis: Number(netBasis.toFixed(4)),
      impliedRepoRatePct: Number(irrPct.toFixed(4)),
      conversionFactor: bond.conversionFactor,
      deliveryInvoicePrice: Number(deliveryInvoicePrice.toFixed(4)),
      dirtyPrice: Number(dirtyPrice.toFixed(4)),
    };
  }
}
