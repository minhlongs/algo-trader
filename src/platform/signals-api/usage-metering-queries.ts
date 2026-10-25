/**
 * Queries the one usage meter exposes about stored usage.
 *
 * Kept apart from the decision path (`check`, `checkMcu`) because a reporting
 * read must never be able to block a request, and apart from the domain writes
 * because these read from `signal_subscriptions` and `usage_metrics` alike.
 *
 * Extracted from the meter class for the repository's 200-LOC file ceiling.
 */

import { query } from '../../db/postgres-client';
import { UsageSnapshot, currentPeriod } from './usage-metering-types';

/**
 * Calls counted for a subscriber in one period.
 *
 * Throws when the durable read fails: an unreadable counter must not be treated
 * as "no usage", or a quota breach would silently pass.
 */
export async function getPeriodUsage(
	subscriberId: string,
	period: string,
): Promise<number> {
	const result = await query<{ calls_this_period: number }>(
		'SELECT calls_this_period FROM usage_metrics WHERE subscriber_id = $1 AND period = $2',
		[subscriberId, period],
	);
	return result.rows[0]?.calls_this_period ?? 0;
}

/** Full usage snapshot for a subscriber, or undefined when they have no row. */
export async function getSnapshot(
	subscriberId: string,
): Promise<UsageSnapshot | undefined> {
	const period = currentPeriod();
	const result = await query<{
		id: string;
		subscriber_id: string;
		period: string;
		calls_today: number;
		calls_this_period: number;
		period_limit: number;
		overage_calls: number;
		last_reset_at: number;
		updated_at: number;
	}>(
		'SELECT * FROM usage_metrics WHERE subscriber_id = $1 AND period = $2',
		[subscriberId, period],
	);
	const row = result.rows[0];
	if (!row) return undefined;

	return {
		id: row.id,
		subscriberId: row.subscriber_id,
		period: row.period,
		callsToday: row.calls_today,
		callsThisPeriod: row.calls_this_period,
		periodLimit: row.period_limit,
		overageCalls: row.overage_calls,
		lastResetAt: row.last_reset_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Per-tier subscriber counts, for the dashboard.
 *
 * Counted from the subscription table rather than the usage row, because a tier
 * with subscribers but no usage this period still exists.
 */
export async function getTierBreakdown(): Promise<Record<string, number>> {
	const result = await query<{ tier: string; cnt: number }>(
		`SELECT tier, COUNT(*) as cnt
		 FROM signal_subscriptions
		 WHERE active = 1
		 GROUP BY tier`,
	);
	const breakdown: Record<string, number> = {};
	for (const row of result.rows) {
		breakdown[row.tier] = row.cnt;
	}
	return breakdown;
}
