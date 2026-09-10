/**
 * License Analytics and Query Utilities
 */

import {
	License,
	LicenseTier,
	LicenseStatus,
	LicenseFilters,
	LicenseListResponse,
} from '../../shared/types/license';
import { LicenseAnalyticsSummary } from './license-types';

export function paginateLicenses(
	licenses: Map<string, License>,
	filters: LicenseFilters = {}
): LicenseListResponse {
	let result = Array.from(licenses.values());

	if (filters.status && filters.status !== 'all') {
		result = result.filter((l) => l.status === filters.status);
	}

	if (filters.tier && filters.tier !== 'all') {
		result = result.filter((l) => l.tier === filters.tier);
	}

	const total = result.length;
	const skip = filters.skip || 0;
	const take = filters.take || 10;

	result = result.slice(skip, skip + take);

	return {
		licenses: result,
		total,
		hasMore: skip + take < total,
	};
}

export function computeLicenseAnalytics(licenses: Map<string, License>): LicenseAnalyticsSummary {
	const allLicenses = Array.from(licenses.values());

	const byTier: Record<string, number> = {
		[LicenseTier.FREE]: allLicenses.filter((l) => l.tier === LicenseTier.FREE).length,
		[LicenseTier.STARTER]: allLicenses.filter((l) => l.tier === LicenseTier.STARTER).length,
		[LicenseTier.PRO]: allLicenses.filter((l) => l.tier === LicenseTier.PRO).length,
		[LicenseTier.ENTERPRISE]: allLicenses.filter((l) => l.tier === LicenseTier.ENTERPRISE).length,
		[LicenseTier.MASTER]: allLicenses.filter((l) => l.tier === LicenseTier.MASTER).length,
	};

	const byStatus = {
		[LicenseStatus.ACTIVE]: allLicenses.filter((l) => l.status === LicenseStatus.ACTIVE).length,
		[LicenseStatus.EXPIRED]: allLicenses.filter((l) => l.status === LicenseStatus.EXPIRED).length,
		[LicenseStatus.REVOKED]: allLicenses.filter((l) => l.status === LicenseStatus.REVOKED).length,
	};

	const recentActivity = allLicenses
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
		.slice(0, 10)
		.map((l) => ({
			licenseId: l.id,
			licenseName: l.name,
			event: 'created',
			timestamp: l.createdAt,
		}));

	return {
		totalLicenses: allLicenses.length,
		byTier,
		byStatus,
		totalRevenue: 0,
		mrr: 0,
		avgLicenseValue: 0,
		recentActivity,
	};
}
