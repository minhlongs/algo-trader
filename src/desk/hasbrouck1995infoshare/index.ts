// SPDX-License-Identifier: MIT
/**
 * Wave 340 — Hasbrouck (1995) One Security, Many Markets: Determining the Contributions to Price Discovery
 * Computes VECM permanent random-walk innovation variance shares (Information Shares IS_j)
 * across fragmented trading venues.
 */

export interface VenueInnovationContribution {
  readonly venue: string;
  readonly longRunImpactPsi: number;
  readonly innovationStdSigma: number;
}

export interface Hasbrouck1995Input {
  readonly venues: readonly VenueInnovationContribution[];
}

export interface Hasbrouck1995VenueResult {
  readonly venue: string;
  readonly varianceContribution: number;
  readonly informationShare: number;
  readonly informationSharePct: number;
  readonly role: 'PRICE_LEADER' | 'CO_DISCOVERY' | 'LAGGING_FOLLOWER';
}

export interface Hasbrouck1995Output {
  readonly totalRandomWalkVariance: number;
  readonly leaderVenue: string;
  readonly leaderInformationSharePct: number;
  readonly herfindahlConcentration: number;
  readonly venues: readonly Hasbrouck1995VenueResult[];
}

export class Hasbrouck1995InfoShareEngine {
  public computeInformationShares(input: Hasbrouck1995Input): Hasbrouck1995Output {
    const rawContribs = input.venues.map((v) => {
      const psi = Math.max(0, v.longRunImpactPsi);
      const sigma = Math.max(1e-9, v.innovationStdSigma);
      const varianceContribution = Math.pow(psi * sigma, 2);
      return { venue: v.venue, varianceContribution };
    });

    const totalRandomWalkVariance = Math.max(
      1e-12,
      rawContribs.reduce((acc, c) => acc + c.varianceContribution, 0),
    );

    const venues: Hasbrouck1995VenueResult[] = rawContribs.map((c) => {
      const share = c.varianceContribution / totalRandomWalkVariance;
      const pct = share * 100;
      const role =
        pct >= 40 ? 'PRICE_LEADER' : pct >= 15 ? 'CO_DISCOVERY' : 'LAGGING_FOLLOWER';
      return {
        venue: c.venue,
        varianceContribution: Number(c.varianceContribution.toFixed(8)),
        informationShare: Number(share.toFixed(6)),
        informationSharePct: Number(pct.toFixed(2)),
        role,
      };
    });

    const sorted = [...venues].sort((a, b) => b.informationShare - a.informationShare);
    const leader = sorted[0] ?? { venue: 'NONE', informationSharePct: 0 };
    const herfindahlConcentration = venues.reduce(
      (acc, v) => acc + v.informationShare * v.informationShare,
      0,
    );

    return {
      totalRandomWalkVariance: Number(totalRandomWalkVariance.toFixed(8)),
      leaderVenue: leader.venue,
      leaderInformationSharePct: leader.informationSharePct,
      herfindahlConcentration: Number(herfindahlConcentration.toFixed(6)),
      venues,
    };
  }
}
