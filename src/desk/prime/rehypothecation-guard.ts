/**
 * Collateral Rehypothecation & Segregation Guard
 * Enforces regulatory rehypothecation limits (e.g. 140% of customer margin debit under SEC Rule 15c3-3).
 *
 * @module desk/prime/rehypothecation-guard
 */

import {
  CollateralAsset,
  RehypothecationLimits,
  RehypothecationStatus,
} from './prime-types';

export class RehypothecationGuard {
  private readonly haircuts: Record<CollateralAsset['assetClass'], number> = {
    CASH: 0.0,
    TREASURY: 0.02,
    EQUITY: 0.15,
    CRYPTO: 0.5,
  };

  public evaluateClientCollateral(
    clientAssets: CollateralAsset[],
    limits: RehypothecationLimits,
    currentlyPledgedUsd: number
  ): RehypothecationStatus {
    let rawCollateralTotal = 0;
    let postHaircutCollateral = 0;

    for (const asset of clientAssets) {
      rawCollateralTotal += asset.marketValueUsd;
      const haircut = this.haircuts[asset.assetClass] ?? 0.2;
      postHaircutCollateral += asset.marketValueUsd * (1 - haircut);
    }

    const maxPermissiblePledgeUsd = Number(
      (limits.totalClientMarginDebitUsd * limits.maxRehypothecationFactor).toFixed(2)
    );

    // Any asset value beyond maxPermissiblePledgeUsd must be fully segregated
    const eligibleCollateralUsd = Number(postHaircutCollateral.toFixed(2));
    const availableToPledgeUsd = Number(
      Math.max(0, Math.min(eligibleCollateralUsd, maxPermissiblePledgeUsd) - currentlyPledgedUsd).toFixed(2)
    );

    const isCompliant = currentlyPledgedUsd <= maxPermissiblePledgeUsd;
    const excessHaircutUsd = Number((rawCollateralTotal - postHaircutCollateral).toFixed(2));

    return {
      clientAccountId: limits.clientAccountId,
      eligibleCollateralUsd,
      maxPermissiblePledgeUsd,
      currentlyPledgedUsd,
      availableToPledgeUsd,
      isCompliant,
      excessHaircutUsd,
    };
  }

  public validateNewPledge(
    requestedPledgeUsd: number,
    status: RehypothecationStatus
  ): { isApproved: boolean; reason?: string } {
    if (requestedPledgeUsd <= 0) {
      return { isApproved: false, reason: 'Invalid non-positive pledge amount requested' };
    }

    if (requestedPledgeUsd > status.availableToPledgeUsd) {
      return {
        isApproved: false,
        reason: `Pledge request exceeds permissible headroom. Headroom: $${status.availableToPledgeUsd}`,
      };
    }

    return { isApproved: true };
  }
}
