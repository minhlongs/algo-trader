/**
 * License Service Helpers
 * Pure builders, validation, and lookup helpers for LicenseService.
 */

import {
	License,
	LicenseTier,
	LicenseStatus,
	CreateLicenseInput,
} from '../../shared/types/license';
import {
	LicenseUsage,
	getDefaultMaxUsage,
} from './license-types';

export function generateLicenseId(): string {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function resolveLicenseTier(tierInput: string): { tierUpper: string; tierEnum: LicenseTier } {
	const tierUpper = tierInput.toUpperCase();
	const tierEnum = LicenseTier[tierUpper as keyof typeof LicenseTier] || LicenseTier.FREE;
	return { tierUpper, tierEnum };
}

export function buildGeneratedLicense(
	id: string,
	key: string,
	tierUpper: string,
	tierEnum: LicenseTier,
	input: { userId?: string; tier: string; validUntil?: Date }
): License {
	const now = new Date().toISOString();
	return {
		id,
		key,
		name: tierUpper,
		tier: tierEnum,
		status: LicenseStatus.ACTIVE,
		userId: input.userId || 'anon',
		createdAt: now,
		updatedAt: now,
		usageCount: 0,
		maxUsage: getDefaultMaxUsage(tierEnum),
		expiresAt: input.validUntil?.toISOString(),
	};
}

export function buildCreatedLicense(
	id: string,
	key: string,
	input: CreateLicenseInput
): License {
	const now = new Date().toISOString();
	return {
		id,
		name: input.name,
		key,
		tier: input.tier,
		status: LicenseStatus.ACTIVE,
		createdAt: now,
		updatedAt: now,
		usageCount: 0,
		maxUsage: getDefaultMaxUsage(input.tier),
		tenantId: input.tenantId,
		domain: input.domain,
		expiresAt: input.expiresAt,
	};
}

export function isLicenseValid(license: License | undefined, userId?: string): boolean {
	if (!license) return false;
	if (userId && license.userId !== userId) return false;
	return license.status === LicenseStatus.ACTIVE;
}

export function toLicenseUsage(license: License | undefined): LicenseUsage | null {
	if (!license) return null;
	return {
		callsToday: license.usageCount || 0,
		tier: license.tier,
		key: license.key,
	};
}

export function findLicenseByKey(
	licenses: Map<string, License>,
	key: string
): License | undefined {
	for (const license of licenses.values()) {
		if (license.key === key) return license;
	}
	return undefined;
}

export function findLicenseBySubscription(
	licenses: Map<string, License>,
	subscriptionId: string
): License | undefined {
	for (const license of licenses.values()) {
		if (license.subscriptionId === subscriptionId) return license;
	}
	return undefined;
}
