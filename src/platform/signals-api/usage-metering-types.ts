/**
 * Types and constants for usage metering service.
 */

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

export const MONTHLY_LIMITS: Record<string, number> = {
	FREE: 1_000,
	PRO: 10_000,
	ENTERPRISE: 100_000,
};

export const DAILY_LIMITS: Record<string, number> = {
	FREE: 100,
	PRO: 10_000,
	ENTERPRISE: 100_000,
};

export const OVERAGE_PRICES: Record<string, number> = {
	FREE: 0,
	PRO: 0.01,
	ENTERPRISE: 0.005,
};

/** Get the current billing period key (YYYY-MM). */
export function currentPeriod(): string {
	const d = new Date();
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
