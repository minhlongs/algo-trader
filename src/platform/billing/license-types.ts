/**
 * License Service Types and Constants
 * ROIaaS Phase 2 - License domain types, tier prefixes, and defaults
 */

import { LicenseTier } from '../../shared/types/license';

export const LICENSE_PREFIX = 'raas';

export const TIER_PREFIXES: Record<LicenseTier, string> = {
	[LicenseTier.FREE]: 'free',
	[LicenseTier.STARTER]: 'rst',
	[LicenseTier.PRO]: 'rpp',
	[LicenseTier.ENTERPRISE]: 'rep',
	[LicenseTier.MASTER]: 'rmt',
};

/** Options for test/API convenience constructor */
export interface LicenseServiceOptions {
	secret?: string;
	issuer?: string;
}

/** Per-license usage snapshot returned by getUsage */
export interface LicenseUsage {
	callsToday: number;
	tier: LicenseTier;
	key: string;
}

export interface LicenseActivityItem {
	licenseId: string;
	licenseName: string;
	event: string;
	timestamp: string;
}

export interface LicenseAnalyticsSummary {
	totalLicenses: number;
	byTier: Record<string, number>;
	byStatus: Record<string, number>;
	totalRevenue: number;
	mrr: number;
	avgLicenseValue: number;
	recentActivity: LicenseActivityItem[];
}

export function generateRandomSegment(length: number): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUV0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

export function createLicenseKey(tier: LicenseTier): string {
	const tierPrefix = TIER_PREFIXES[tier];
	const segment1 = generateRandomSegment(8);
	const segment2 = generateRandomSegment(8);
	return `${LICENSE_PREFIX}-${tierPrefix}-${segment1}-${segment2}`.toUpperCase();
}

export function getDefaultMaxUsage(tier: LicenseTier): number {
	switch (tier) {
		case LicenseTier.FREE:
			return 100;
		case LicenseTier.STARTER:
			return 5000;
		case LicenseTier.PRO:
			return 10000;
		case LicenseTier.ENTERPRISE:
			return 100000;
		case LicenseTier.MASTER:
			return 500000;
	}
}
