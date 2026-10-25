/**
 * Types for usage metering.
 *
 * The tier allowance tables and the lookups that read them live in
 * `usage-metering-allowances.ts`; this module keeps the shapes and re-exports
 * them so existing importers keep resolving from one place.
 */

export {
	MONTHLY_LIMITS,
	DAILY_LIMITS,
	MCU_LIMITS,
	MCU_OVERAGE_PRICES,
	MCU_EXHAUSTED_STATUS,
	OVERAGE_PRICES,
	UNLIMITED,
	isUnlimited,
	currentPeriod,
	allowanceFor,
} from './usage-metering-allowances';

/**
 * A usage threshold newly crossed by one subscriber in the current period.
 * `licenseKey` is kept alongside `subscriberId` so the existing alert
 * dispatchers (which key recipients by license) keep working unchanged.
 */
export interface ThresholdAlert {
	licenseKey: string;
	subscriberId: string;
	threshold: number;
	percentUsed: number;
	/** Calls already counted this period, from the durable row. */
	used: number;
	/** The monthly allowance this percentage was measured against. */
	limit: number;
	tier: string;
	period: string;
	timestamp: string;
}

/** Usage thresholds, as percentages of the monthly allowance, that raise an alert. */
export const ALERT_THRESHOLDS = [80, 90, 100] as const;

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
	/** Calls already counted this period, read from the durable row. */
	used: number;
	/** The monthly allowance this decision was measured against. */
	limit: number;
}

/**
 * Whether a compute-unit request is within the tier's allowance.
 *
 * `limit` is negative for an unlimited tier, which must never read as "already
 * exhausted": `isAllowed` is answered before the negative allowance is compared
 * against anything.
 */
export interface McuCheckResult {
	isAllowed: boolean;
	statusCode: 200 | 402;
	/** MCU already consumed this period, from the durable row. */
	used: number;
	/** The monthly allowance this decision was measured against. */
	limit: number;
	remainingMcu: number;
	tier: string;
	period: string;
	/** Present only on a denial, so the caller can render an upgrade path. */
	upgradeUrl?: string;
	/** Present only on a denial. */
	error?: string;
}

/**
 * Trade-volume counters. This is a second unit measured on the same durable
 * row as the API-call counters: a call is one API request, a trade is one
 * executed order, and neither may be counted against the other's allowance.
 */
export interface UsageMetrics {
	totalTrades: number;
	successfulTrades: number;
	failedTrades: number;
	totalVolume: number;
	averageTradeSize: number;
}

/** One subscriber's trade and call usage for a period, for the revenue dashboard. */
export interface UsageStatusView {
	subscriberId: string;
	period: string;
	tier: string;
	callsUsed: number;
	monthlyLimit: number;
	percentUsed: number;
	isExceeded: boolean;
	overageUnits: number;
	overageCost: number;
}

/** The metered-unit allowance a tier is entitled to. */
export interface QuotaAllocation {
	tier: string;
	monthlyQuota: number;
	dailyQuota: number;
	overagePricePerUnit: number;
}
