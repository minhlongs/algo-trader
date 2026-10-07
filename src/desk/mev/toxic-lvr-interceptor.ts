/**
 * Toxic LVR Interceptor
 * Detects unhedged price discrepancies between AMM pools and external order book venues,
 * preemptively neutralizing toxic LVR arbitrage by external searchers.
 *
 * @module desk/mev/toxic-lvr-interceptor
 */

import { ToxicLvrInterception } from './mev-protection-types';

export class ToxicLvrInterceptor {
  private readonly lvrDiscrepancyThresholdBps: number;
  private readonly baseArbSizeUnits: number;

  public constructor(lvrDiscrepancyThresholdBps = 15, baseArbSizeUnits = 100) {
    this.lvrDiscrepancyThresholdBps = lvrDiscrepancyThresholdBps;
    this.baseArbSizeUnits = baseArbSizeUnits;
  }

  public interceptLvr(poolAddress: string, ammPrice: number, externalVenuePrice: number): ToxicLvrInterception {
    if (ammPrice <= 0 || externalVenuePrice <= 0) {
      return {
        poolAddress,
        externalVenuePrice,
        ammPoolPrice: ammPrice,
        priceDiscrepancyBps: 0,
        isToxicArbDetected: false,
        suggestedInternalArbSize: 0,
      };
    }

    const priceDiff = Math.abs(ammPrice - externalVenuePrice);
    const mid = (ammPrice + externalVenuePrice) / 2;
    const discrepancyBps = (priceDiff / mid) * 10_000;

    const isToxicArbDetected = discrepancyBps >= this.lvrDiscrepancyThresholdBps;
    const suggestedInternalArbSize = isToxicArbDetected
      ? Math.round(this.baseArbSizeUnits * (discrepancyBps / this.lvrDiscrepancyThresholdBps))
      : 0;

    return {
      poolAddress,
      externalVenuePrice,
      ammPoolPrice: ammPrice,
      priceDiscrepancyBps: Number(discrepancyBps.toFixed(2)),
      isToxicArbDetected,
      suggestedInternalArbSize,
    };
  }
}
