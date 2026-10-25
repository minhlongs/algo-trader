/**
 * The trade-volume domain of the one usage meter.
 *
 * A trade is one executed order, measured in both a count and a notional volume.
 * It is a separate unit from API calls and compute units on the same durable
 * row: spending the API allowance must never spend the trade allowance, or the
 * reverse, because the three are different products with different prices.
 *
 * Extracted from the meter class for the repository's 200-LOC file ceiling
 * rather than for any behavioral reason: the meter is one class with one store,
 * and each domain is one file that talks to it.
 */

import { query } from '../../db/postgres-client';
import {
	MONTHLY_LIMITS,
	allowanceFor,
	currentPeriod,
} from './usage-metering-types';

/**
 * Record one executed trade and its volume, and return the new trade count.
 *
 * The allowance written onto the row comes from the shared resolver, which
 * refuses a tier the price book does not declare rather than charging the trade
 * against the free allowance a paying customer never agreed to.
 */
export async function recordTrade(
	subscriberId: string,
	tier: string,
	volume: number,
): Promise<number> {
	const period = currentPeriod();
	const id = `usage_${subscriberId}_${period}`;
	const periodLimit = allowanceFor(MONTHLY_LIMITS, tier);
	const result = await query<{ trades_this_period: number }>(
		`INSERT INTO usage_metrics (id, subscriber_id, period, calls_today, calls_this_period, trades_this_period, trade_volume, period_limit, updated_at)
		 VALUES ($1, $2, $3, 0, 0, 1, $4, $5, $6)
		 ON CONFLICT (subscriber_id, period) DO UPDATE SET
			trades_this_period = usage_metrics.trades_this_period + 1,
			trade_volume = usage_metrics.trade_volume + EXCLUDED.trade_volume,
			updated_at = EXCLUDED.updated_at
		 RETURNING trades_this_period`,
		[id, subscriberId, period, volume, periodLimit, Date.now()],
	);

	if (result.rows[0] === undefined) {
		// The statement returned no row, so the count it just accepted is
		// unknown. Returning zero here would report a spent allowance as untouched.
		throw new Error(`[UsageMetering] trade upsert returned no row for ${subscriberId}`);
	}
	return result.rows[0].trades_this_period;
}
