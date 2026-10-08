import { CipParameters, CipResult } from './fx-types';

export class CipBasisCalculator {
  /**
   * Covered Interest Parity (CIP) relationship:
   * F_theoretical = S * (1 + r_d * T) / (1 + r_f * T)
   * where T = tenorDays / 360 (Money market convention)
   *
   * CIP Basis = ( (F_market / S) * (1 + r_f * T) - (1 + r_d * T) ) * 10000 (bps)
   */
  public evaluateCipBasis(params: CipParameters): CipResult {
    const { spotRate, forwardRate, domesticRatePct, foreignRatePct, tenorDays } = params;
    if (spotRate <= 0 || forwardRate <= 0) throw new Error('Spot and forward rates must be positive');
    if (tenorDays <= 0) throw new Error('Tenor days must be positive');

    const t = tenorDays / 360.0;
    const rD = domesticRatePct / 100.0;
    const rF = foreignRatePct / 100.0;

    const domesticFactor = 1.0 + rD * t;
    const foreignFactor = 1.0 + rF * t;

    const theoreticalForward = spotRate * (domesticFactor / foreignFactor);
    const forwardPoints = (forwardRate - spotRate) * 10000;

    // CIP Basis: synthetic domestic return minus actual domestic return in bps
    const syntheticDomesticFactor = (forwardRate / spotRate) * foreignFactor;
    const basisDecimal = syntheticDomesticFactor - domesticFactor;
    const cipBasisBps = Number((basisDecimal * 10000).toFixed(2));

    let direction: 'BORROW_DOMESTIC_LEND_FOREIGN' | 'BORROW_FOREIGN_LEND_DOMESTIC' | 'EQUILIBRIUM' = 'EQUILIBRIUM';
    if (cipBasisBps > 1.0) {
      // Synthetic domestic return > actual domestic borrowing rate
      direction = 'BORROW_DOMESTIC_LEND_FOREIGN';
    } else if (cipBasisBps < -1.0) {
      // Domestic borrowing is more expensive or foreign investment is cheaper
      direction = 'BORROW_FOREIGN_LEND_DOMESTIC';
    }

    return {
      theoreticalForward: Number(theoreticalForward.toFixed(6)),
      marketForward: forwardRate,
      forwardPoints: Number(forwardPoints.toFixed(2)),
      cipBasisBps,
      arbitrageDirection: direction,
    };
  }
}
