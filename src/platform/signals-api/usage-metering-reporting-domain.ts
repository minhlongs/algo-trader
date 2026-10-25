/**
 * The read-model domain of the one usage meter: everything that reports on
 * usage rather than deciding it.
 *
 * These queries read the same durable `usage_metrics` rows the quota gate
 * decides against, so a dashboard and a rejection always see the same number.
 * They are separated from the decision path because they answer a different
 * question — "what has this subscriber consumed" rather than "may this request
 * proceed" — and because a reporting bug must not be able to block a request.
 *
 * Extracted from the meter class for the repository's 200-LOC file ceiling
 * rather than for any behavioral reason.
 */

import { query } from '../../db/postgres-client';
import {
	UsageMetrics,
	UsageStatusView,
	MONTHLY_LIMITS,
	OVERAGE_PRICES,
	currentPeriod,
} from './usage-metering-types';

/** The row shape a subscriber's counters live in for one period. */
interface SubscriberRow {
	calls_this_period: number;
	trades_this_period: number;
	trade_volume: number;
	[key: string]: number;
}

/** Read one subscriber's counters for the current period. */
export async function readSubscriberRow(
	subscriberId: string,
): Promise<SubscriberRow | undefined> {
	const period = currentPeriod();
	const result = await query<SubscriberRow>(
		'SELECT calls_this_period, trades_this_period, trade_volume FROM usage_metrics WHERE subscriber_id = $1 AND period = $2',
		[subscriberId, period],
	);
	return result.rows[0];
}

/** Trade-volume counters for a subscriber this period. */
export async function getMetrics(subscriberId: string): Promise<UsageMetrics> {
	const row = await readSubscriberRow(subscriberId);
	const totalTrades = row?.trades_this_period ?? 0;
	const totalVolume = Number(row?.trade_volume ?? 0);
	return {
		totalTrades,
		// The quota meter does not track failed orders: a rejected order never
		// reached the exchange, so it consumed no allowance. Reporting them as
		// zero here is honest; the trade ledger is the source for that number.
		successfulTrades: totalTrades,
		failedTrades: 0,
		totalVolume,
		averageTradeSize: totalTrades > 0 ? totalVolume / totalTrades : 0,
	};
}

/**
 * Every subscriber with usage in a period, for the revenue dashboard.
 *
 * Both the tier and the overage price are recovered from the limit the row was
 * written with, rather than re-derived from a tier the request claimed, so a
 * row is priced by the allowance it was actually charged against.
 */
export async function getAllUsageData(period?: string): Promise<UsageStatusView[]> {
	const target = period ?? currentPeriod();
	const result = await query<{
		subscriber_id: string;
		calls_this_period: number;
		period_limit: number;
	}>(
		`SELECT subscriber_id, calls_this_period, period_limit
		 FROM usage_metrics WHERE period = $1
		 ORDER BY calls_this_period DESC`,
		[target],
	);
	return result.rows.map((r) => {
		const limit = r.period_limit;
		const used = r.calls_this_period;
		const overageUnits = Math.max(0, used - limit);
		return {
			subscriberId: r.subscriber_id,
			period: target,
			tier: tierForLimit(limit),
			callsUsed: used,
			monthlyLimit: limit,
			percentUsed: limit > 0 ? (used / limit) * 100 : 0,
			isExceeded: used > limit,
			overageUnits,
			overageCost: overageUnits * overagePriceForLimit(limit),
		};
	});
}

/**
 * Revenue summary for a period, computed from the same durable rows the quota
 * gate reads.
 *
 * This replaces a Redis key scan that reported a placeholder tier and a
 * hard-coded monthly limit, so overage revenue was billed off limits no customer
 * actually has. Subscription revenue is not derivable from the meter alone, so it
 * stays explicit here rather than silently zero.
 */
export async function getRevenueSummary(period?: string): Promise<{
	subscriptionRevenue: number;
	overageRevenue: number;
	totalRevenue: number;
	customerCount: number;
	averageRevenuePerCustomer: number;
}> {
	const usage = await getAllUsageData(period);
	const overageRevenue = usage.reduce((sum, u) => sum + u.overageCost, 0);
	const customerCount = usage.length;
	// Metering measures usage, not subscription invoices; the payment provider
	// remains the source for subscription revenue.
	const subscriptionRevenue = 0;
	const totalRevenue = subscriptionRevenue + overageRevenue;
	return {
		subscriptionRevenue,
		overageRevenue,
		totalRevenue,
		customerCount,
		averageRevenuePerCustomer: customerCount > 0 ? totalRevenue / customerCount : 0,
	};
}

/** Reverse-map a stored monthly limit back to its tier label. */
function tierForLimit(limit: number): string {
	for (const [tier, monthly] of Object.entries(MONTHLY_LIMITS)) {
		if (monthly === limit) return tier;
	}
	return 'FREE';
}

/** Reverse-map a stored monthly limit back to its overage price. */
function overagePriceForLimit(limit: number): number {
	const tier = tierForLimit(limit);
	return OVERAGE_PRICES[tier] ?? 0;
}
