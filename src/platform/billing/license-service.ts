/**
 * License Service
 * ROIaaS Phase 2 - License CRUD and key generation
 * Storage: JSON file persistence (no additional deps required)
 */

import {
	License,
	LicenseTier,
	LicenseStatus,
	CreateLicenseInput,
	LicenseFilters,
	LicenseListResponse,
} from '../../shared/types/license';
import {
	LicenseServiceOptions,
	LicenseUsage,
	LicenseAnalyticsSummary,
	createLicenseKey,
	getDefaultMaxUsage,
} from './license-types';
import { saveToFile, loadFromFile } from './license-store';
import { paginateLicenses, computeLicenseAnalytics } from './license-analytics';

export { LicenseServiceOptions, LicenseUsage };

export class LicenseService {
	private static instance: LicenseService;
	private licenses: Map<string, License> = new Map();
	private options: LicenseServiceOptions = {};

	/** Test/API convenience constructor — also acts as singleton factory */
	constructor(options: LicenseServiceOptions = {}) {
		if (LicenseService.instance) return LicenseService.instance;
		this.licenses = loadFromFile();
		this.options = options;
		LicenseService.instance = this;
	}

	/** Standard singleton — production use */
	static resetInstance(): void {
		LicenseService.instance = null as unknown as LicenseService;
	}

	static getInstance(options?: LicenseServiceOptions): LicenseService {
		if (!LicenseService.instance) {
			LicenseService.instance = new LicenseService(options);
		}
		return LicenseService.instance;
	}

	generateLicenseKey(tier: LicenseTier): string {
		return createLicenseKey(tier);
	}

	/**
	 * Test/API convenience: generate a license key for a tier.
	 * Stores the license in-memory for validateLicense to check.
	 * Maps tier string to LicenseTier enum for prefix selection.
	 */
	generateLicense(input: { userId?: string; tier: string; validUntil?: Date }): string {
		const tierUpper = input.tier.toUpperCase();
		const tierEnum = LicenseTier[tierUpper as keyof typeof LicenseTier] || LicenseTier.FREE;
		const key = this.generateLicenseKey(tierEnum);
		const license: License = {
			id: `lic_${this.generateId()}`,
			key,
			name: tierUpper,
			tier: tierEnum,
			status: LicenseStatus.ACTIVE,
			userId: input.userId || 'anon',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			usageCount: 0,
			maxUsage: getDefaultMaxUsage(tierEnum),
			expiresAt: input.validUntil?.toISOString(),
		};
		this.licenses.set(key, license);
		return key;
	}

	/**
	 * Validate a license key against stored licenses.
	 * Returns true if key exists, is ACTIVE, and userId matches (if provided).
	 */
	validateLicense(key: string, userId?: string): boolean {
		const license = this.licenses.get(key);
		if (!license) return false;
		if (userId && license.userId !== userId) return false;
		return license.status === LicenseStatus.ACTIVE;
	}

	/**
	 * Record an API call against a license key (increments usageCount).
	 * Returns the updated usage snapshot.
	 */
	async recordApiCall(key: string): Promise<void> {
		const license = this.licenses.get(key);
		if (!license) return;
		license.usageCount = (license.usageCount || 0) + 1;
		license.updatedAt = new Date().toISOString();
		saveToFile(this.licenses);
	}

	/**
	 * Get usage snapshot for a license key.
	 */
	getUsage(key: string): LicenseUsage | null {
		const license = this.licenses.get(key);
		if (!license) return null;
		return {
			callsToday: license.usageCount || 0,
			tier: license.tier,
			key: license.key,
		};
	}

	async createLicense(input: CreateLicenseInput): Promise<License> {
		const id = `lic_${this.generateId()}`;
		const key = this.generateLicenseKey(input.tier);
		const now = new Date().toISOString();

		const license: License = {
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

		this.licenses.set(id, license);
		saveToFile(this.licenses);
		return license;
	}

	getLicense(id: string): License | undefined {
		return this.licenses.get(id);
	}

	getLicenseByKey(key: string): License | undefined {
		for (const license of this.licenses.values()) {
			if (license.key === key) return license;
		}
		return undefined;
	}

	getLicenseBySubscription(subscriptionId: string): License | undefined {
		for (const license of this.licenses.values()) {
			if (license.subscriptionId === subscriptionId) return license;
		}
		return undefined;
	}

	async listLicenses(filters: LicenseFilters = {}): Promise<LicenseListResponse> {
		return paginateLicenses(this.licenses, filters);
	}

	async revokeLicense(id: string): Promise<License | undefined> {
		const license = this.licenses.get(id);
		if (!license) return undefined;

		license.status = LicenseStatus.REVOKED;
		license.updatedAt = new Date().toISOString();
		this.licenses.set(id, license);
		saveToFile(this.licenses);
		return license;
	}

	async deleteLicense(id: string): Promise<boolean> {
		const deleted = this.licenses.delete(id);
		if (deleted) saveToFile(this.licenses);
		return deleted;
	}

	async getAnalytics(): Promise<LicenseAnalyticsSummary> {
		return computeLicenseAnalytics(this.licenses);
	}

	private generateId(): string {
		return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
	}
}
