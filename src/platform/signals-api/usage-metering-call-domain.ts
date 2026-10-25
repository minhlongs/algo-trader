/**
 * The API-call domain of the one usage meter.
 *
 * A call is one API request: it is counted in its own column with its own
 * monthly allowance, separate from trades and compute units, because the three
 * are different products with different prices and must never cross-spend.
 *
 * Extracted from the meter class for the repository's 200-LOC file ceiling
 * rather than for any behavioral reason: the meter is one class with one
 * durable store, and each domain is one file that talks to it.
 */

import { query } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import {
	ALERT_THRESHOLDS,
	MONTHLY_LIMITS,
	ThresholdAlert,
	allowanceFor,
	currentPeriod,
	isUnlimited,
} from './usage-metering-types';

/** The allowance a tier's API calls are measured against. */
export function callLimitFor(tier: string): number {
	return allowanceFor(MONTHLY_LIMITS, tier);
}

/**
 * The state the one upsert statement returns: the new durable count, the
 * allowance it was measured against, and the thresholds already alerted.
 *
 * Returning all three from a single statement is what keeps the alert decision
 * atomic — the alerted set is read from the same row snapshot the count came
 * from, so two concurrent callers cannot both pass an "already alerted" check
 * and double-send. A separate read would reintroduce exactly that race.
 */
export interface CallRecordResult {
	used: number;
	limit: number;
	alerted: unknown;
}

/**
 * Record an API call for billing, and return the state the row is now in.
 *
 * The row written here is the single number both the allowance decision and the
 * billing count read, so callers never reconcile two sources.
 */
export async function recordCall(
	subscriberId: string,
	tier: string,
): Promise<CallRecordResult> {
	const period = currentPeriod();
	const now = Date.now();
	const id = `usage_${subscriberId}_${period}`;
	const periodLimit = callLimitFor(tier);

	const result = await query<Record<string, string | number | boolean | null>>(
		`INSERT INTO usage_metrics (id, subscriber_id, period, calls_today, calls_this_period, period_limit, updated_at)
		 VALUES ($1, $2, $3, 1, 1, $4, $5)
		 ON CONFLICT (subscriber_id, period) DO UPDATE SET
				calls_this_period = usage_metrics.calls_this_period + 1,
				updated_at = EXCLUDED.updated_at
		 RETURNING calls_this_period, period_limit, alerted_thresholds`,
		[id, subscriberId, period, periodLimit, now],
	);

	const row = result.rows[0] as
		| { calls_this_period: number; period_limit: number; alerted_thresholds: unknown }
		| undefined;
	if (row === undefined) {
		// The statement returned no row, so the count it just accepted is
		// unknown. Returning zero here would report a spent allowance as untouched.
		throw new Error(`[UsageMetering] call upsert returned no row for ${subscriberId}`);
	}
	return {
		used: Number(row.calls_this_period),
		limit: Number(row.period_limit),
		alerted: row.alerted_thresholds,
	};
}

/**
 * Resolve which thresholds a count newly crossed, and mark them alerted.
 *
 * The markers are persisted before the alerts are handed to `emitAlert`, so a
 * crash between the two re-sends at worst a duplicate, never a silent loss.
 * An unlimited tier has no percentage to cross, so it returns before computing
 * one off a negative allowance.
 */
export async function raiseCrossedThresholds(
	subscriberId: string,
	tier: string,
	row: CallRecordResult,
	emitAlert: (alert: ThresholdAlert) => void,
): Promise<void> {
	if (isUnlimited(row.limit) || row.limit <= 0) return;
	const percentUsed = (row.used / row.limit) * 100;
	const already = Array.isArray(row.alerted)
		? row.alerted.filter((n): n is number => typeof n === 'number')
		: [];

	const crossed = ALERT_THRESHOLDS.filter(
		(threshold) => percentUsed >= threshold && !already.includes(threshold),
	);
	if (crossed.length === 0) return;

	try {
		await markThresholdsAlerted(subscriberId, crossed);
	} catch (err) {
		// Alerting is advisory, so a failure to persist the alerted set is
		// logged rather than thrown: a lost marker only risks a duplicate
		// alert, never a wrong quota decision.
		logger.error('[UsageMetering] failed to record alerted thresholds', {
			subscriberId, err,
		});
	}

	for (const threshold of crossed) {
		emitAlert({
			licenseKey: subscriberId,
			subscriberId,
			threshold,
			percentUsed,
			used: row.used,
			limit: row.limit,
			tier,
			period: currentPeriod(),
			timestamp: new Date().toISOString(),
		});
	}
}

/**
 * Persist the alerted markers so a restart cannot re-send them.
 * Uses a subquery-scoped append so the markers stay on the same row as the
 * count that raised them, rather than in a second store.
 */
async function markThresholdsAlerted(
	subscriberId: string,
	thresholds: number[],
): Promise<void> {
	const period = currentPeriod();
	await query(
		`UPDATE usage_metrics
		 SET alerted_thresholds = (
			 SELECT COALESCE(usage_metrics.alerted_thresholds, '[]'::jsonb) || $3::jsonb
		 )
		 WHERE subscriber_id = $1 AND period = $2`,
		[subscriberId, period, JSON.stringify(thresholds)],
	);
}
