/**
 * The pricing and allowance surface of the one usage meter: what a tier is
 * entitled to, and what exceeding it costs.
 *
 * Kept apart from `usage-metering-service-core.ts` for the repository's 200-LOC
 * file ceiling rather than for any behavioral reason — the meter is one class
 * with one durable store, and each surface is one module that reads the same
 * price book. Every function here is a pure table lookup, so it can never
 * disagree with the quota decision about what a tier bought.
 */

import type {
	QuotaAllocation,
	McuCheckResult,
} from './usage-metering-types';
import {
	MONTHLY_LIMITS,
	DAILY_LIMITS,
	MCU_LIMITS,
	MCU_OVERAGE_PRICES,
	OVERAGE_PRICES,
	allowanceFor,
	isUnlimited,
} from './usage-metering-allowances';
import { checkMcu, recordMcu, computeMcuOverage } from './usage-metering-mcu-domain';

/** One tier's metered-unit allowance, for the tier-discipline checks. */
export interface TierLimits {
	monthlyLimit: number;
	dailyLimit: number;
}

/** The metered-unit allowance a tier is entitled to. */
export function readQuotaAllocation(tier: string): QuotaAllocation {
	return {
		tier,
		monthlyQuota: allowanceFor(MONTHLY_LIMITS, tier),
		dailyQuota: allowanceFor(DAILY_LIMITS, tier),
		overagePricePerUnit: OVERAGE_PRICES[tier] ?? 0,
	};
}

/** Monthly allowance for a tier, for the tier-discipline checks. */
export function readTierLimits(tier: string): TierLimits {
	return {
		monthlyLimit: allowanceFor(MONTHLY_LIMITS, tier),
		dailyLimit: allowanceFor(DAILY_LIMITS, tier),
	};
}

/**
 * Compute overage charges for a subscriber this period.
 * An unlimited tier has no overage, so it is answered directly rather than
 * priced off a negative allowance (which would compute an enormous charge).
 */
export function priceCallOverage(tier: string, callsThisPeriod: number): number {
	const limit = allowanceFor(MONTHLY_LIMITS, tier);
	if (isUnlimited(limit)) return 0;
	const overage = Math.max(0, callsThisPeriod - limit);
	return overage * (OVERAGE_PRICES[tier] ?? 0);
}

/**
 * Whether a compute-unit (MCU) request is within this subscriber's allowance.
 * MCU is a separate unit from API calls on the same durable row, so consuming
 * one never spends the other's allowance.
 */
export function isMcuAllowed(
	subscriberId: string,
	tier: string,
	requestedMcu = 1,
): Promise<McuCheckResult> {
	return checkMcu(subscriberId, tier, requestedMcu);
}

/**
 * Record compute units for billing and return the new durable count.
 *
 * Compute units deliberately raise no threshold alert. The previous compute
 * meter had none, and the alert dedup markers are shared across domains on
 * this row — so reusing them would let an API-call alert silently suppress a
 * compute one, or vice versa. That policy needs a decision, so it is left out
 * rather than guessed at.
 */
export function recordMcuUsage(
	subscriberId: string,
	tier: string,
	mcuUsed: number,
): Promise<number> {
	return recordMcu(subscriberId, tier, mcuUsed);
}

/**
 * Price compute units consumed beyond the allowance.
 * An unlimited tier has no overage rather than an enormous one computed off
 * a negative allowance.
 */
export function priceMcuOverage(tier: string, mcuThisPeriod: number): number {
	return computeMcuOverage(tier, mcuThisPeriod);
}
