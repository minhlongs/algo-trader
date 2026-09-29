import { VenueId, OrderSide } from './sor-types';

export interface VenueFeeGasProfile {
  takerFeeBps: number;
  makerFeeBps: number;
  gasCostUsd: number;
}

export const DEFAULT_FEE_GAS_PROFILES: Record<VenueId, VenueFeeGasProfile> = {
  binance: { takerFeeBps: 7.5, makerFeeBps: 2.0, gasCostUsd: 0 },
  bybit: { takerFeeBps: 10.0, makerFeeBps: 2.0, gasCostUsd: 0 },
  polymarket_clob: { takerFeeBps: 10.0, makerFeeBps: 0.0, gasCostUsd: 0.05 },
  amm_cpmm: { takerFeeBps: 30.0, makerFeeBps: 0.0, gasCostUsd: 0.05 },
  amm_lmsr: { takerFeeBps: 30.0, makerFeeBps: 0.0, gasCostUsd: 0.05 },
};

export class FeeGasModel {
  private readonly profiles: Map<VenueId, VenueFeeGasProfile>;

  constructor(customProfiles?: Partial<Record<VenueId, Partial<VenueFeeGasProfile>>>) {
    this.profiles = new Map();
    for (const [v, defaultProfile] of Object.entries(DEFAULT_FEE_GAS_PROFILES)) {
      const venue = v as VenueId;
      const custom = customProfiles?.[venue];
      this.profiles.set(venue, {
        takerFeeBps: custom?.takerFeeBps ?? defaultProfile.takerFeeBps,
        makerFeeBps: custom?.makerFeeBps ?? defaultProfile.makerFeeBps,
        gasCostUsd: custom?.gasCostUsd ?? defaultProfile.gasCostUsd,
      });
    }
  }

  public getProfile(venueId: VenueId): VenueFeeGasProfile {
    const profile = this.profiles.get(venueId);
    if (!profile) {
      return { takerFeeBps: 10, makerFeeBps: 2, gasCostUsd: 0 };
    }
    return profile;
  }

  public getFeeBps(venueId: VenueId, isTaker = true): number {
    const profile = this.getProfile(venueId);
    return isTaker ? profile.takerFeeBps : profile.makerFeeBps;
  }

  public getGasCostUsd(venueId: VenueId): number {
    return this.getProfile(venueId).gasCostUsd;
  }

  public calculateFeeUsd(venueId: VenueId, notionalUsd: number, isTaker = true): number {
    const feeBps = this.getFeeBps(venueId, isTaker);
    return notionalUsd * (feeBps / 10000);
  }

  public calculateEffectivePrice(
    rawPrice: number,
    side: OrderSide,
    venueId: VenueId,
    quantity: number,
    isTaker = true
  ): number {
    if (quantity <= 0) return rawPrice;
    const feeBps = this.getFeeBps(venueId, isTaker);
    const gasCostUsd = this.getGasCostUsd(venueId);
    const unitGas = gasCostUsd / quantity;

    if (side === 'BUY') {
      const feeMultiplier = 1 + feeBps / 10000;
      return rawPrice * feeMultiplier + unitGas;
    } else {
      const feeMultiplier = 1 - feeBps / 10000;
      return Math.max(0, rawPrice * feeMultiplier - unitGas);
    }
  }

  /**
   * Gas hurdle condition: Delta P * q_v > G_v
   * On-chain venues are only chosen if price improvement covers fixed gas cost.
   */
  public passesGasHurdle(
    priceImprovementPerUnit: number,
    quantity: number,
    gasCostUsd: number
  ): boolean {
    if (gasCostUsd <= 0) return true;
    return priceImprovementPerUnit * quantity > gasCostUsd;
  }

  public isGasHurdleSatisfied(
    targetVenuePrice: number,
    fallbackVenuePrice: number,
    quantity: number,
    gasCostUsd: number,
    side: OrderSide
  ): boolean {
    if (gasCostUsd <= 0) return true;
    const deltaP = side === 'BUY'
      ? fallbackVenuePrice - targetVenuePrice
      : targetVenuePrice - fallbackVenuePrice;
    return this.passesGasHurdle(deltaP, quantity, gasCostUsd);
  }
}
