/**
 * Tier allowance tables and the lookups that read them.
 *
 * These numbers are the price book the meter bills against, so they stay in one
 * module next to the lookup that refuses an unknown tier.
 */

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

/** USD charged per call beyond the monthly allowance. */
export const OVERAGE_PRICES: Record<string, number> = {
	FREE: 0,
	STARTER: 0.01,
	PRO: 0.01,
	ENTERPRISE: 0.005,
	MASTER: 0,
};

/** The status a compute-unit denial maps to: this unit is a billed product. */
export const MCU_EXHAUSTED_STATUS = 402 as const;

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
