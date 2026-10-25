/**
 * The API-call quota decision, as a pure function of the durable count.
 *
 * Kept apart from the meter class for the repository's 200-LOC file ceiling, and
 * because the decision is the part worth testing on its own: given a count and a
 * price book, it answers allow or deny without touching any store.
 */

import { MONTHLY_LIMITS, allowanceFor, isUnlimited, currentPeriod } from './usage-metering-allowances';
import type { UsageCheckResult } from './usage-metering-types';

/**
 * Decide whether a call is allowed, from the count the durable row already holds.
 *
 * `allowed` and `remaining` both come from the one durable row the caller
 * increments, so the number that blocks a request and the number that bills it
 * can never disagree. `remaining` must not come from an in-process counter: that
 * counter is never reset, so it keeps counting down until the process restarts
 * and reports a false block (or a false pass, after a restart resets it to zero).
 *
 * An unlimited tier is declared with a negative limit, which must never be read
 * as "already over budget" — so the unlimited check runs before any comparison.
 */
export function decideCallAllowance(tier: string, used: number): UsageCheckResult {
	const period = currentPeriod();
	const periodLimit = allowanceFor(MONTHLY_LIMITS, tier);
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
