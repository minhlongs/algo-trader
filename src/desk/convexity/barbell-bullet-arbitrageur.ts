import { BarbellBulletTrade, BarbellComparisonResult } from './convexity-types';
import { BondConvexityEngine } from './bond-convexity-engine';

export class BarbellBulletArbitrageur {
  private readonly engine = new BondConvexityEngine();

  public compareBarbellVsBullet(trade: BarbellBulletTrade): BarbellComparisonResult {
    const bullet = this.engine.analyzeConvexity(trade.bulletBond);
    const shortBond = this.engine.analyzeConvexity(trade.shortTenorBond);
    const longBond = this.engine.analyzeConvexity(trade.longTenorBond);

    const dBullet = bullet.modifiedDurationYears;
    const dShort = shortBond.modifiedDurationYears;
    const dLong = longBond.modifiedDurationYears;

    if (Math.abs(dLong - dShort) < 1e-4) {
      throw new Error('Short and long bonds must have distinct durations');
    }

    // Solve for weights: w_short * D_short + w_long * D_long = D_bullet, w_short + w_long = 1
    const wLong = (dBullet - dShort) / (dLong - dShort);
    const wShort = 1.0 - wLong;

    const barbellConvexity = wShort * shortBond.effectiveConvexity + wLong * longBond.effectiveConvexity;
    const bulletConvexity = bullet.effectiveConvexity;
    const convexityAdvantage = barbellConvexity - bulletConvexity;

    return {
      barbellWeightShort: Number(wShort.toFixed(4)),
      barbellWeightLong: Number(wLong.toFixed(4)),
      matchedDurationYears: Number(dBullet.toFixed(4)),
      bulletConvexity: Number(bulletConvexity.toFixed(4)),
      barbellConvexity: Number(barbellConvexity.toFixed(4)),
      convexityAdvantage: Number(convexityAdvantage.toFixed(4)),
      pnlUnderYieldShockPct: (deltaYieldPct: number) => {
        const bulletPnl = bullet.priceChangeEstimatePct(deltaYieldPct);
        const shortPnl = shortBond.priceChangeEstimatePct(deltaYieldPct);
        const longPnl = longBond.priceChangeEstimatePct(deltaYieldPct);
        const barbellPnl = wShort * shortPnl + wLong * longPnl;

        return {
          barbellPct: Number(barbellPnl.toFixed(4)),
          bulletPct: Number(bulletPnl.toFixed(4)),
          netAdvantagePct: Number((barbellPnl - bulletPnl).toFixed(4)),
        };
      },
    };
  }
}
