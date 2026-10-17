/**
 * Wave 216: Avellaneda & Lipkin (2003) Short Squeeze Math.
 *
 * Implements non-linear feedback ODEs for hard-to-borrow shares and forced buy-ins.
 * Strictly < 175 LOC, zero mocks, zero :any.
 */

import {
  AvellanedaLipkinConfig,
  ShortSqueezeSimulationParams,
  SqueezeTrajectoryPoint,
} from './avellaneda-lipkin-types';

export class AvellanedaLipkinMath {
  public static readonly DEFAULT_COUPLING = 0.45;
  public static readonly DEFAULT_VOLATILITY = 0.025;

  public static calculateDaysToCover(shortShares: number, adv: number): number {
    if (adv <= 0) return Infinity;
    return shortShares / adv;
  }

  public static calculateShortInterestPct(shortShares: number, floatShares: number): number {
    if (floatShares <= 0) return 0.0;
    return (shortShares / floatShares) * 100.0;
  }

  public static calculateDynamicBorrowFee(baseAnnualRate: number, siPct: number): number {
    // Non-linear fee escalation as short interest surpasses float thresholds
    const normalizedLoad = Math.max(0, siPct) / 25.0;
    const multiplier = 1.0 + Math.pow(normalizedLoad, 2.5);
    return baseAnnualRate * multiplier;
  }

  public static calculateForcedBuyInIntensity(
    currentPrice: number,
    triggerPrice: number,
    shortShares: number,
    adv: number,
    coupling = AvellanedaLipkinMath.DEFAULT_COUPLING
  ): number {
    if (currentPrice <= triggerPrice || shortShares <= 0 || adv <= 0) return 0.0;
    const priceExcessRatio = (currentPrice - triggerPrice) / triggerPrice;
    const daysToCover = Math.max(1.0, shortShares / adv);
    // Forced buy-in speed accelerates with both price deviation and short days-to-cover
    const speed = coupling * priceExcessRatio * Math.min(shortShares, adv * Math.sqrt(daysToCover));
    return Math.min(shortShares, Math.max(0, speed));
  }

  public static simulateSqueezeTrajectory(
    config: AvellanedaLipkinConfig,
    params: ShortSqueezeSimulationParams
  ): {
    trajectory: SqueezeTrajectoryPoint[];
    terminalPrice: number;
    maxBuyInSpeed: number;
    isSqueezeTriggered: boolean;
  } {
    const N = Math.max(10, params.intervals ?? 50);
    const T = Math.max(0.1, params.horizonDays);
    const dt = T / N;

    const initialShock = params.initialPriceShockPct ?? 0.0;
    let price = config.spotPrice * (1.0 + initialShock / 100.0);
    const triggerPrice = config.squeezeTriggerPrice ?? config.spotPrice * 1.05;
    let shortShares = Math.max(0, config.shortInterestShares);
    const adv = Math.max(1, config.averageDailyVolume);
    const floatShares = Math.max(1, config.freeFloatShares);
    const coupling = config.squeezeCouplingCoeff ?? AvellanedaLipkinMath.DEFAULT_COUPLING;

    const trajectory: SqueezeTrajectoryPoint[] = [];
    let maxBuyInSpeed = 0;
    let isSqueezeTriggered = false;

    for (let i = 0; i < N; i++) {
      const t = (i + 1) * dt;
      const siPct = (shortShares / floatShares) * 100.0;
      const dynBorrowFee = this.calculateDynamicBorrowFee(config.annualBorrowFeeRate, siPct);

      const buyInSpeed = this.calculateForcedBuyInIntensity(
        price,
        triggerPrice,
        shortShares,
        adv,
        coupling
      );
      if (buyInSpeed > maxBuyInSpeed) maxBuyInSpeed = buyInSpeed;
      if (buyInSpeed > 0.05 * adv) isSqueezeTriggered = true;

      // Price drift combines short covering demand (+ impact) minus borrow cost drag
      const demandImpact = (buyInSpeed / adv) * 0.15; // Price boost from forced flow
      const priceDriftRate = demandImpact - dynBorrowFee / 365.0;
      price = Math.max(0.01, price * (1.0 + priceDriftRate * dt));

      const coveredShares = Math.min(shortShares, buyInSpeed * dt);
      shortShares = Math.max(0, shortShares - coveredShares);

      trajectory.push({
        step: i + 1,
        timeDays: Number(t.toFixed(4)),
        stockPrice: Number(price.toFixed(2)),
        borrowFeePct: Number((dynBorrowFee * 100.0).toFixed(2)),
        forcedBuyInSpeedSharesPerDay: Number(buyInSpeed.toFixed(0)),
        remainingShortShares: Math.round(shortShares),
        shortInterestPct: Number(siPct.toFixed(2)),
      });
    }

    return {
      trajectory,
      terminalPrice: Number(price.toFixed(2)),
      maxBuyInSpeed: Number(maxBuyInSpeed.toFixed(0)),
      isSqueezeTriggered,
    };
  }
}
