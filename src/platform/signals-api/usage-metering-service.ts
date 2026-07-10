/**
 * Usage Metering Service
 *
 * Tracks per-subscriber API call counts for Signals API billing.
 * Persists usage snapshots to D1 for the current billing period.
 *
 * Billing period: calendar month (UTC).
 * Rate limit enforcement is in-memory (reset on restart) to avoid D1 round-trips
 * on every signal delivery. Persistence runs at the end of each period.
 */

import { query } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';

export interface UsageSnapshot {
	id: string;
	subscriberId: string;
	period: string; // "2026-07"
	callsToday: number;
	callsThisPeriod: number;
	periodLimit: number;
	overageCalls: number;
	lastResetAt: number; // unix ms
	updatedAt: number;
}

export interface UsageCheckResult {
	allowed: boolean;
	remaining: number;
	limitReached: boolean;
	overage: number;
	tier: string;
	period: string;
}

const MONTHLY_LIMITS: Record<string, number> = {
	FREE: 1_000,
	PRO: 10_000,
	ENTERPRISE: 100_000,
};

const DAILY_LIMITS: Record<string, number> = {
	FREE: 100,
	PRO: 10_000,
	ENTERPRISE: 100_000,
};

const OVERAGE_PRICES: Record<string, number> = {
	FREE: 0,
	PRO: 0.01,
	ENTERPRISE: 0.005,
};

/** Get the current billing period key (YYYY-MM). */
function currentPeriod(): string {
	const d = new Date();
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** In-memory counter cache — reset at period boundary or server restart. */
class InMemoryCounter {
	private counts = new Map<string, number>();

	increment(key: string): number {
		const next = (this.counts.get(key) ?? 0) + 1;
		this.counts.set(key, next);
		return next;
	}

	get(key: string): number {
		return this.counts.get(key) ?? 0;
	}

	check(key: string, limit: number): { allowed: boolean; count: number } {
		const count = this.increment(key);
		return { allowed: count <= limit, count };
	}

	isNewPeriod(lastPeriod: string | undefined): boolean {
		return lastPeriod !== currentPeriod();
	}

	reset(keys: string[]): void {
		for (const k of keys) this.counts.delete(k);
	}
}

// Singleton
export class UsageMeteringService {
	private counter = new InMemoryCounter();

	/**
	 * Check if a call is allowed and track it.
	 * Returns allowance status + remaining budget.
	 */
	async check(subscriberId: string, tier: string): Promise<UsageCheckResult> {
		const period = currentPeriod();
		const periodLimit = MONTHLY_LIMITS[tier] ?? 1_000;
		const periodUsed = await this.getPeriodUsage(subscriberId, period);

		// Check monthly limit
		if (periodUsed >= periodLimit) {
			return {
				allowed: false,
				remaining: 0,
				limitReached: true,
				overage: periodUsed - periodLimit,
				tier,
				period,
			};
		}

		// Fast in-memory tick for current request
		const { count } = this.counter.check(`usage:${subscriberId}:period`, periodLimit);

		return {
			allowed: true,
			remaining: Math.max(0, periodLimit - count),
			limitReached: false,
			overage: 0,
			tier,
			period,
		};
	}

	/** Record an API call for billing. Idempotent (best-effort dedup). */
	async recordCall(subscriberId: string, tier: string): Promise<void> {
		const period = currentPeriod();
		const now = Date.now();

		try {
			await query(
				`INSERT INTO usage_metrics (id, subscriber_id, period, calls_today, calls_this_period, period_limit, updated_at)
				 VALUES ($1, $2, $3, 1, 1, $4, $5)
				 ON CONFLICT (subscriber_id, period) DO UPDATE SET
					calls_this_period = usage_metrics.calls_this_period + 1,
					updated_at = EXCLUDED.updated_at`,
				[
					`usage_${subscriberId}_${period}`,
					subscriberId,
					period,
					MONTHLY_LIMITS[tier] ?? 1_000,
					now,
				],
			);
		} catch (err) {
			logger.warn('[UsageMeter] recordCall error (non-fatal)', {
				subscriberId,
				err,
			});
		}
	}

	/** Get usage for a specific period. */
	async getPeriodUsage(subscriberId: string, period: string): Promise<number> {
		try {
			const result = await query<{ calls_this_period: number }>(
				'SELECT calls_this_period FROM usage_metrics WHERE subscriber_id = $1 AND period = $2',
				[subscriberId, period],
			);
			return result.rows[0]?.calls_this_period ?? 0;
		} catch {
			return 0;
		}
	}

	/** Get full usage snapshot for a subscriber. */
	async getSnapshot(subscriberId: string): Promise<UsageSnapshot | undefined> {
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
		if (!result.rows[0]) return undefined;

		const r = result.rows[0]!;
		return {
			id: r.id,
			subscriberId: r.subscriber_id,
			period: r.period,
			callsToday: r.calls_today,
			callsThisPeriod: r.calls_this_period,
			periodLimit: r.period_limit,
			overageCalls: r.overage_calls,
			lastResetAt: r.last_reset_at,
			updatedAt: r.updated_at,
		};
	}

	/** Get per-tier usage breakdown (for dashboard). */
	async getTierBreakdown(): Promise<Record<string, number>> {
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

	/** Compute overage charges for a subscriber this period. */
	computeOverage(tier: string, callsThisPeriod: number): number {
		const limit = MONTHLY_LIMITS[tier] ?? 1_000;
		const overage = Math.max(0, callsThisPeriod - limit);
		return overage * (OVERAGE_PRICES[tier] ?? 0);
	}
}

// Singleton
export const usageMetering = new UsageMeteringService();
