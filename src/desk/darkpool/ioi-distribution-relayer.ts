/**
 * Indication of Interest (IOI) Relayer & Distribution Manager
 * Disseminates anonymous liquidity intentions without leaking order book alpha.
 *
 * @module desk/darkpool/ioi-distribution-relayer
 */

import { IndicationOfInterest } from './darkpool-types';

export class IoiDistributionRelayer {
  private readonly activeIois = new Map<string, IndicationOfInterest>();

  public broadcastIoi(ioi: IndicationOfInterest): { accepted: boolean; activeCount: number } {
    if (ioi.expiryTimestampMs <= Date.now()) {
      return { accepted: false, activeCount: this.activeIois.size };
    }
    this.activeIois.set(ioi.ioiId, ioi);
    return { accepted: true, activeCount: this.activeIois.size };
  }

  public getFilteredIois(symbol: string, minTier?: IndicationOfInterest['sizeTier']): IndicationOfInterest[] {
    const tierRanking: Record<IndicationOfInterest['sizeTier'], number> = {
      SMALL: 1,
      MEDIUM: 2,
      LARGE: 3,
      BLOCK: 4,
    };

    const targetRank = minTier ? tierRanking[minTier] : 1;
    const now = Date.now();

    return Array.from(this.activeIois.values())
      .filter((i) => i.symbol === symbol && i.expiryTimestampMs > now)
      .filter((i) => tierRanking[i.sizeTier] >= targetRank);
  }

  public revokeIoi(ioiId: string): boolean {
    return this.activeIois.delete(ioiId);
  }
}
