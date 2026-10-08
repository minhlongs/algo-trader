/**
 * Hasbrouck Information Share Model
 * Calculates venue-specific contribution to common efficient price discovery via Cholesky decomposition of innovation covariance.
 *
 * @module desk/microstructure/hasbrouck-information-share
 */

import { HasbrouckInformationShare } from './microstructure-types';

export class HasbrouckInformationShareCalculator {
  public calculateShare(
    leadVenue: string,
    followVenue: string,
    leadVar: number,
    followVar: number,
    covariance: number
  ): HasbrouckInformationShare {
    // Cholesky factorization of 2x2 covariance matrix:
    // [q11, 0]
    // [q21, q22]
    const q11 = Math.sqrt(Math.max(1e-6, leadVar));
    const q21 = covariance / q11;
    const q22 = Math.sqrt(Math.max(1e-6, followVar - q21 * q21));

    // Permanent price innovation variance
    const totalInnovationVar = Math.pow(q11 + q21, 2) + Math.pow(q22, 2);

    const s1 = Math.pow(q11 + q21, 2) / Math.max(1e-6, totalInnovationVar);
    const s2 = Math.pow(q22, 2) / Math.max(1e-6, totalInnovationVar);

    const leadSharePct = Number((s1 * 100).toFixed(2));
    const followSharePct = Number((s2 * 100).toFixed(2));

    return {
      leadVenue,
      followVenue,
      leadInformationSharePct: leadSharePct,
      followInformationSharePct: followSharePct,
      permanentPriceVariance: Number(totalInnovationVar.toFixed(6)),
    };
  }
}
