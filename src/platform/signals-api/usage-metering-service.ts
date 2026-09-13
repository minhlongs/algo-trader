/**
 * Usage Metering Service (Barrel Facade)
 *
 * Tracks per-subscriber API call counts for Signals API billing.
 * Persists usage snapshots to D1 for the current billing period.
 */

export type {
	UsageSnapshot,
	UsageCheckResult,
} from './usage-metering-types';

export {
	MONTHLY_LIMITS,
	DAILY_LIMITS,
	OVERAGE_PRICES,
	currentPeriod,
} from './usage-metering-types';

export {
	UsageMeteringService,
	usageMetering,
} from './usage-metering-service-core';
