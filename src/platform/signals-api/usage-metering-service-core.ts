/**
 * Core Usage Metering Service implementation.
 */

import { EventEmitter } from 'events';
import {
	UsageSnapshot,
	UsageCheckResult,
	UsageMetrics,
	UsageStatusView,
	QuotaAllocation,
	McuCheckResult,
	MONTHLY_LIMITS,
	DAILY_LIMITS,
	OVERAGE_PRICES,
	allowanceFor,
	isUnlimited,
	currentPeriod,
} from './usage-metering-types';
import { checkMcu, recordMcu, computeMcuOverage } from './usage-metering-mcu-domain';
import {
	recordCall as recordCallInStore,
	raiseCrossedThresholds as raiseCallThresholds,
} from './usage-metering-call-domain';
import { recordTrade as recordTradeInStore } from './usage-metering-trade-domain';
import {
	getMetrics as getMetricsFromStore,
	getRevenueSummary as getRevenueSummaryFromStore,
	getAllUsageData as getAllUsageDataFromStore,
} from './usage-metering-reporting-domain';
import {
	getPeriodUsage as getPeriodUsageFromStore,
	getSnapshot as getSnapshotFromStore,
	getTierBreakdown as getTierBreakdownFromStore,
} from './usage-metering-queries';

/**
 * The one usage meter. It extends EventEmitter only to raise `threshold_alert`
 * for the existing alert dispatchers; every count it emits from is read from
 * and written to the durable `usage_metrics` row, so the number that blocks a
 * request, bills it, and alerts on it is the same number.
 */
export class UsageMeteringService extends EventEmitter {

	/**
	 * The singleton the rest of the app shares. `usageMetering` below is the
	 * preferred spelling; this exists so callers written against the previous
	 * meter (`UsageMeteringService.getInstance()`) keep compiling and — more
	 * importantly — keep reading the same durable row, rather than getting a
	 * second meter with its own store.
	 */
	static getInstance(): UsageMeteringService {
		return usageMetering;
	}

	/**
	 * Check whether a call is allowed for this subscriber and period.
	 *
	 * `allowed` and `remaining` both come from the one durable row
	 * `recordCall` writes, so the number that blocks a request and the number
	 * that bills it can never disagree. `remaining` must not come from the
	 * in-process counter: that counter is never reset, so it keeps counting
	 * down until the process restarts and reports a false block (or a false
	 * pass, after a restart resets it to zero).
	 */
	async check(subscriberId: string, tier: string): Promise<UsageCheckResult> {
		const period = currentPeriod();
		const periodLimit = allowanceFor(MONTHLY_LIMITS, tier);
		const used = await this.getPeriodUsage(subscriberId, period);

		// Unlimited tiers are declared with a negative limit; a negative limit
		// must never be read as "already over budget".
		const unlimited = isUnlimited(periodLimit);
		const overLimit = !unlimited && used >= periodLimit;

		if (overLimit) {
			return {
				allowed: false,
				remaining: 0,
				limitReached: true,
				overage: used - periodLimit,
				tier,
				period,
				used,
				limit: periodLimit,
			};
		}

		return {
			allowed: true,
			remaining: unlimited ? Number.MAX_SAFE_INTEGER : periodLimit - used,
			limitReached: false,
			overage: 0,
			tier,
			period,
			used,
			limit: periodLimit,
		};
	}

	/**
	 * Whether a compute-unit (MCU) request is within this subscriber's allowance.
	 *
	 * MCU is a separate unit from API calls on the same durable row, so consuming
	 * one never spends the other's allowance. The implementation lives in its own
	 * module for the file-size ceiling; the store and the tier lookups are shared.
	 */
	async checkMcu(subscriberId: string, tier: string, requestedMcu = 1): Promise<McuCheckResult> {
		return checkMcu(subscriberId, tier, requestedMcu);
	}

	/**
	 * Record compute units for billing and return the new durable count.
	 *
	 * Same row, same statement shape as `recordCall`: the count that denies a
	 * request and the count that bills it are one number.
	 *
	 * Compute units deliberately raise no threshold alert. The previous compute
	 * meter had none, and the alert dedup markers are shared across domains on
	 * this row — so reusing them would let an API-call alert silently suppress a
	 * compute one, or vice versa. That policy needs a decision, so it is left out
	 * rather than guessed at.
	 */
	async recordMcu(subscriberId: string, tier: string, mcuUsed: number): Promise<number> {
		return recordMcu(subscriberId, tier, mcuUsed);
	}

	/**
	 * Price compute units consumed beyond the allowance.
	 * An unlimited tier has no overage rather than an enormous one computed off
	 * a negative allowance.
	 */
	computeMcuOverage(tier: string, mcuThisPeriod: number): number {
		return computeMcuOverage(tier, mcuThisPeriod);
	}

	/**
	 * Record an API call for billing, and raise any usage threshold it crossed.
	 *
	 * The row written here is the single number both the allowance decision and
	 * the billing count read, so callers never reconcile two sources. The
	 * threshold bookkeeping rides the same row: a threshold is marked as
	 * alerted before the alert is emitted, so a restart cannot re-send an alert
	 * that was already sent.
	 */
	async recordCall(subscriberId: string, tier: string): Promise<number> {
		// The alerted set comes back from the same statement that incremented the
		// count, so the alert decision stays atomic with the write that raised it.
		const recorded = await recordCallInStore(subscriberId, tier);
		await raiseCallThresholds(
			subscriberId,
			tier,
			recorded,
			(alert) => this.emit('threshold_alert', alert),
		);
		return recorded.used;
	}

	/**
	 * Get usage for a specific period.
	 * Throws when the durable read fails: an unreadable counter must not be
	 * treated as "no usage", or a quota breach would silently pass.
	 */
	async getPeriodUsage(subscriberId: string, period: string): Promise<number> {
		return getPeriodUsageFromStore(subscriberId, period);
	}

	/** Get full usage snapshot for a subscriber. */
	async getSnapshot(subscriberId: string): Promise<UsageSnapshot | undefined> {
		return getSnapshotFromStore(subscriberId);
	}

	/** Get per-tier usage breakdown (for dashboard). */
	async getTierBreakdown(): Promise<Record<string, number>> {
		return getTierBreakdownFromStore();
	}

	/**
	 * Compute overage charges for a subscriber this period.
	 * An unlimited tier has no overage, so it is answered directly rather than
	 * priced off a negative allowance (which would compute an enormous charge).
	 */
	computeOverage(tier: string, callsThisPeriod: number): number {
		const limit = allowanceFor(MONTHLY_LIMITS, tier);
		if (isUnlimited(limit)) return 0;
		const overage = Math.max(0, callsThisPeriod - limit);
		return overage * (OVERAGE_PRICES[tier] ?? 0);
	}

	/**
	 * Record one executed trade and its volume.
	 *
	 * Trades are a separate unit from API calls on the same row, so a trade
	 * never consumes the API-call allowance and vice versa. Returns the new
	 * trade count for the period.
	 *
	 * `outcome` is accepted and deliberately unused: a failed order is recorded
	 * by the trade ledger, not the quota meter, because it consumed no allowance.
	 */
	async recordTrade(
		subscriberId: string,
		tier: string,
		volume: number,
		outcome: 'success' | 'failed' = 'success',
	): Promise<number> {
		void outcome;
		return recordTradeInStore(subscriberId, tier, volume);
	}

	/** Trade-volume counters for a subscriber this period. */
	async getMetrics(subscriberId: string): Promise<UsageMetrics> {
		return getMetricsFromStore(subscriberId);
	}

	/**
	 * Revenue summary for a period, computed from the same durable rows the
	 * quota gate reads — never from a second store.
	 */
	async getRevenueSummary(period?: string): Promise<{
		subscriptionRevenue: number;
		overageRevenue: number;
		totalRevenue: number;
		customerCount: number;
		averageRevenuePerCustomer: number;
	}> {
		return getRevenueSummaryFromStore(period);
	}

	/** The metered-unit allowance a tier is entitled to. */
	getQuotaAllocation(tier: string): QuotaAllocation {
		return {
			tier,
			monthlyQuota: allowanceFor(MONTHLY_LIMITS, tier),
			dailyQuota: allowanceFor(DAILY_LIMITS, tier),
			overagePricePerUnit: OVERAGE_PRICES[tier] ?? 0,
		};
	}

	/** Monthly allowance for a tier, for the tier-discipline checks. */
	getTierLimits(tier: string): { monthlyLimit: number; dailyLimit: number } {
		return {
			monthlyLimit: allowanceFor(MONTHLY_LIMITS, tier),
			dailyLimit: allowanceFor(DAILY_LIMITS, tier),
		};
	}

	/**
	 * Every subscriber with usage this period, for the revenue dashboard.
	 */
	async getAllUsageData(period?: string): Promise<UsageStatusView[]> {
		return getAllUsageDataFromStore(period);
	}
}

// Singleton
export const usageMetering = new UsageMeteringService();
