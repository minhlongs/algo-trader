/**
 * The quota decision and the counter writes of the one usage meter.
 *
 * Everything here either answers "is this request allowed" or increments the
 * durable row that answer reads from. The allowance/pricing tables
 * (`usage-metering-allowance-methods.ts`) and the dashboard reads
 * (`usage-metering-dashboard-reads.ts`) live apart: nothing on the request path
 * uses them, so a change there cannot widen a quota.
 */

import { EventEmitter } from 'events';
import { UsageCheckResult } from './usage-metering-types';
import {
	recordCall as recordCallInStore,
	raiseCrossedThresholds as raiseCallThresholds,
} from './usage-metering-call-domain';
import { recordTrade as recordTradeInStore } from './usage-metering-trade-domain';
import { getPeriodUsage as getPeriodUsageFromStore } from './usage-metering-queries';
import { checkCallAllowance } from './usage-metering-call-decision';
import {
	readQuotaAllocation,
	readTierLimits,
	priceCallOverage,
	isMcuAllowed,
	recordMcuUsage,
	priceMcuOverage,
	type TierLimits,
} from './usage-metering-allowance-methods';
import {
	readSnapshot,
	readMetrics,
	readTierBreakdown,
	readRevenueSummary,
	readAllUsageData,
} from './usage-metering-dashboard-reads';

import type { RevenueSummary } from './usage-metering-dashboard-reads';

export type { TierLimits } from './usage-metering-allowance-methods';
export type { RevenueSummary } from './usage-metering-dashboard-reads';

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
		return checkCallAllowance(subscriberId, tier, (id, p) => this.getPeriodUsage(id, p));
	}

	/**
	 * Whether a compute-unit (MCU) request is within this subscriber's allowance.
	 * MCU is a separate unit from API calls on the same durable row, so consuming
	 * one never spends the other's allowance.
	 */
	checkMcu(subscriberId: string, tier: string, requestedMcu = 1) {
		return isMcuAllowed(subscriberId, tier, requestedMcu);
	}

	/**
	 * Record compute units for billing and return the new durable count.
	 * Compute units deliberately raise no threshold alert — see
	 * `usage-metering-allowance-methods.ts` for why that policy is left out
	 * rather than guessed at.
	 */
	recordMcu(subscriberId: string, tier: string, mcuUsed: number): Promise<number> {
		return recordMcuUsage(subscriberId, tier, mcuUsed);
	}

	/**
	 * Price compute units consumed beyond the allowance.
	 * An unlimited tier has no overage rather than an enormous one computed off
	 * a negative allowance.
	 */
	computeMcuOverage(tier: string, mcuThisPeriod: number): number {
		return priceMcuOverage(tier, mcuThisPeriod);
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

	/**
	 * Compute overage charges for a subscriber this period.
	 * An unlimited tier has no overage, so it is answered directly rather than
	 * priced off a negative allowance (which would compute an enormous charge).
	 */
	computeOverage(tier: string, callsThisPeriod: number): number {
		return priceCallOverage(tier, callsThisPeriod);
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

	/** The metered-unit allowance a tier is entitled to. */
	getQuotaAllocation(tier: string) {
		return readQuotaAllocation(tier);
	}

	/** Monthly allowance for a tier, for the tier-discipline checks. */
	getTierLimits(tier: string): TierLimits {
		return readTierLimits(tier);
	}

	/** Full usage snapshot for a subscriber. */
	async getSnapshot(subscriberId: string) {
		return readSnapshot(subscriberId);
	}

	/** Trade-volume counters for a subscriber this period. */
	async getMetrics(subscriberId: string) {
		return readMetrics(subscriberId);
	}

	/** Per-tier usage breakdown, for the dashboard. */
	async getTierBreakdown(): Promise<Record<string, number>> {
		return readTierBreakdown();
	}

	/** Revenue summary for a period, computed from the same durable rows. */
	async getRevenueSummary(period?: string): Promise<RevenueSummary> {
		return readRevenueSummary(period);
	}

	/** Every subscriber with usage this period, for the revenue dashboard. */
	async getAllUsageData(period?: string) {
		return readAllUsageData(period);
	}
}

// Singleton
export const usageMetering = new UsageMeteringService();
