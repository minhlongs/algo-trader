/**
 * The compute-unit (MCU) domain of the one usage meter.
 *
 * MCU used to be counted in an in-process `Map` inside the desk BillingMeter,
 * which reset on every restart: a tenant who had spent the whole allowance was
 * unblocked by a redeploy, and one who had barely used it stayed blocked after a
 * reset. This module moves that count onto the same durable `usage_metrics` row
 * the API-call and trade counters already use, so all three units share one
 * store while keeping separate allowances.
 *
 * It is a separate module rather than more methods on the service purely for the
 * repository's 200-LOC file ceiling: the meter is one class with one store, and
 * each domain is one file that talks to it.
 */

import { query } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import {
	MCU_LIMITS,
	MCU_OVERAGE_PRICES,
	MCU_EXHAUSTED_STATUS,
	McuCheckResult,
	allowanceFor,
	isUnlimited,
	currentPeriod,
} from './usage-metering-types';

/** The base path an upgrade link points the tenant at. */
const UPGRADE_BASE = 'https://app.algo-trader.dev/billing/recharge';

/**
 * Read the tier's compute-unit allowance.
 *
 * A tier the price book does not declare is refused rather than measured against
 * the FREE allowance: the desk vocabulary (`BASIC`, `PREMIUM`) names MCU tiers
 * and is deliberately not mapped onto this one, so such a tier reaching here is
 * a caller crossing the boundary between the two contracts — and the fallback
 * would both under-serve that customer and under-bill them.
 */
export function mcuLimitFor(tier: string): number {
	return allowanceFor(MCU_LIMITS, tier);
}

/**
 * Decide whether a compute-unit request is within the allowance.
 *
 * The number that denies the request is the same durable counter
 * `recordMcu` increments and the billing count reads, so the block and the bill
 * can never disagree. An unlimited tier is answered before its negative
 * allowance is compared against anything, so it never reads as exhausted.
 *
 * Throws when the durable read fails: an unreadable counter must not be treated
 * as "no usage", or a quota breach would silently pass.
 */
export async function checkMcu(
	subscriberId: string,
	tier: string,
	requestedMcu = 1,
): Promise<McuCheckResult> {
	const period = currentPeriod();
	const limit = mcuLimitFor(tier);
	const result = await query<{ mcu_this_period: number }>(
		'SELECT mcu_this_period FROM usage_metrics WHERE subscriber_id = $1 AND period = $2',
		[subscriberId, period],
	);
	const used = Number(result.rows[0]?.mcu_this_period ?? 0);
	const unlimited = isUnlimited(limit);
	const exhausted = !unlimited && used + requestedMcu > limit;

	if (exhausted) {
		return {
			isAllowed: false,
			statusCode: MCU_EXHAUSTED_STATUS,
			used,
			limit,
			remainingMcu: Math.max(0, limit - used),
			tier,
			period,
			error: `Monthly compute allowance of ${limit.toLocaleString()} MCU exceeded.`,
			upgradeUrl: `${UPGRADE_BASE}?subscriber=${subscriberId}&mcu=additional`,
		};
	}

	return {
		isAllowed: true,
		statusCode: 200,
		used,
		limit,
		remainingMcu: unlimited ? Number.MAX_SAFE_INTEGER : limit - (used + requestedMcu),
		tier,
		period,
	};
}

/**
 * Record compute units for billing and return the new durable count.
 *
 * The upsert is the same shape as the API-call one: a single statement that
 * creates the period row or increments the existing one, so two concurrent
 * callers cannot lose a count.
 */
export async function recordMcu(
	subscriberId: string,
	tier: string,
	mcuUsed: number,
): Promise<number> {
	const period = currentPeriod();
	const id = `usage_${subscriberId}_${period}`;
	const limit = mcuLimitFor(tier);
	const result = await query<{ mcu_this_period: number }>(
		`INSERT INTO usage_metrics (id, subscriber_id, period, calls_today, calls_this_period, mcu_this_period, period_limit, updated_at)
		 VALUES ($1, $2, $3, 0, 0, $4, $5, $6)
		 ON CONFLICT (subscriber_id, period) DO UPDATE SET
			mcu_this_period = usage_metrics.mcu_this_period + EXCLUDED.mcu_this_period,
			updated_at = EXCLUDED.updated_at
		 RETURNING mcu_this_period`,
		[id, subscriberId, period, mcuUsed, limit, Date.now()],
	);

	if (result.rows[0] === undefined) {
		// The statement returned no row, which means the count it just accepted
		// is unknown. Returning 0 here would report a spent allowance as untouched.
		throw new Error(`[UsageMetering] MCU upsert returned no row for ${subscriberId}`);
	}
	return Number(result.rows[0].mcu_this_period);
}

/**
 * Price the compute units consumed beyond the monthly allowance.
 * An unlimited tier has no overage, so it is answered directly rather than
 * priced off a negative allowance (which would compute an enormous charge).
 * An unknown tier is refused rather than priced at zero: a bill that silently
 * waives its charge is the same under-billing as an allowance nobody bought.
 */
export function computeMcuOverage(tier: string, mcuThisPeriod: number): number {
	const limit = allowanceFor(MCU_LIMITS, tier);
	if (isUnlimited(limit)) return 0;
	const overage = Math.max(0, mcuThisPeriod - limit);
	return overage * (MCU_OVERAGE_PRICES[tier] ?? 0);
}
