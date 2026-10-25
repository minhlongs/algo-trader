/**
 * Types and constants for usage metering service.
 */

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
 * Monthly call allowance per tier, read from the public price book
 * (platform/billing/pricing-tiers.ts `apiCallsPerMonth`). Keeping the two in
 * step matters: a tier missing here silently falls back to the FREE allowance,
 * which both under-serves a paying customer and under-bills them.
 */
export const MONTHLY_LIMITS: Record<string, number> = {
	FREE: 1_000,
	STARTER: 5_000,
	PRO: 10_000,
	ENTERPRISE: 100_000,
	MASTER: -1, // unlimited
};

/** Daily call allowance per tier, derived from the monthly allowance. */
export const DAILY_LIMITS: Record<string, number> = {
	FREE: 100,
	STARTER: 500,
	PRO: 1_000,
	ENTERPRISE: 10_000,
	MASTER: -1, // unlimited
};

/**
 * Monthly compute-unit allowance per tier, in MCU.
 *
 * MCU (Monetizable Compute Unit) is the third unit this meter counts: an API call
 * is one request, a trade is one executed order, and an MCU is one billed compute
 * operation. They are deliberately separate allowances — a caller must not spend
 * API calls against a compute budget, or the reverse — so this is its own table
 * rather than a derived view of MONTHLY_LIMITS. `docs/mcu-definition.md` records
 * what one unit costs.
 */
export const MCU_LIMITS: Record<string, number> = {
	FREE: 1_000,
	STARTER: 5_000,
	PRO: 25_000,
	ENTERPRISE: 250_000,
	MASTER: -1, // unlimited
};

/** USD charged per MCU beyond the monthly allowance. */
export const MCU_OVERAGE_PRICES: Record<string, number> = {
	FREE: 0,
	STARTER: 0.02,
	PRO: 0.01,
	ENTERPRISE: 0.005,
	MASTER: 0,
};

/** The status a compute-unit denial maps to: this unit is a billed product. */
export const MCU_EXHAUSTED_STATUS = 402 as const;

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

/** USD charged per call beyond the monthly allowance. */
export const OVERAGE_PRICES: Record<string, number> = {
	FREE: 0,
	STARTER: 0.01,
	PRO: 0.01,
	ENTERPRISE: 0.005,
	MASTER: 0,
};

/** Sentinel for a tier with no cap; a negative limit means "not metered". */
export const UNLIMITED = -1;

/** True when a tier declares no monthly cap. */
export function isUnlimited(limit: number): boolean {
	return limit < 0;
}

/** Get the current billing period key (YYYY-MM). */
export function currentPeriod(): string {
	const d = new Date();
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Read a tier's allowance out of a price book, refusing a tier the book omits.
 *
 * A tier missing from the book used to fall back to the FREE allowance, which is
 * the worst of the three possible answers: it neither serves the customer what
 * they bought nor refuses the request. It silently hands a paying customer the
 * free tier's allowance — a PREMIUM tenant measured against 1,000 MCU instead of
 * the 25,000 they purchased — and it bills them at free-tier overage rates on
 * top of that.
 *
 * There is a second reason to refuse rather than guess. Two tier vocabularies
 * live in this repo: the canonical `FREE|STARTER|PRO|ENTERPRISE|MASTER` that
 * prices API calls, and the desk `BASIC|PREMIUM|ENTERPRISE|MASTER` that prices
 * MCU. They are separate contracts and are deliberately not mapped onto each
 * other, so a desk tier name reaching a canonical price book is a caller
 * crossing a boundary it does not own — not a misspelling to be forgiven. The
 * message names both sides so the mismatch is diagnosable from the error alone.
 */
export function allowanceFor(book: Record<string, number>, tier: string): number {
	const allowance = book[tier];
	if (allowance === undefined) {
		throw new Error(
			`[UsageMetering] unknown tier "${tier}": the price book declares ` +
				`${Object.keys(book).join(', ')}. Refusing rather than falling back to the ` +
				`free allowance, which would under-serve and under-bill the customer.`,
		);
	}
	return allowance;
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
