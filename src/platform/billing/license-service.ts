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
} from './license-types';
import {
	buildLicenseFromInput,
	buildLicenseFromTierInput,
} from './license-record-factory';
import { saveToFile, loadFromFile } from './license-store';
import { paginateLicenses, computeLicenseAnalytics } from './license-analytics';

export { LicenseServiceOptions, LicenseUsage };

export class LicenseService {
	private static instance: LicenseService;
	private licenses: Map<string, License> = new Map();
	private options: LicenseServiceOptions = {};

	constructor(options: LicenseServiceOptions = {}) {
		if (LicenseService.instance) return LicenseService.instance;
		this.licenses = loadFromFile();
		this.options = options;
		LicenseService.instance = this;
	}

	static resetInstance(): void {
		LicenseService.instance = null as unknown as LicenseService;
	}

	static getInstance(options?: LicenseServiceOptions): LicenseService {
		if (!LicenseService.instance) {
			LicenseService.instance = new LicenseService(options);
		}
		return LicenseService.instance;
	}

	generateLicenseKey(tier: LicenseTier): string { return createLicenseKey(tier); }

	generateLicense(input: { userId?: string; tier: string; validUntil?: Date }): string {
		const license = buildLicenseFromTierInput(input);
		this.licenses.set(license.key, license);
		return license.key;
	}

	validateLicense(key: string, userId?: string): boolean {
		const license = this.licenses.get(key);
		if (!license || (userId && license.userId !== userId)) return false;
		return license.status === LicenseStatus.ACTIVE;
	}

	async recordApiCall(key: string): Promise<void> {
		const license = this.licenses.get(key);
		if (!license) return;
		license.usageCount = (license.usageCount || 0) + 1;
		license.updatedAt = new Date().toISOString();
		saveToFile(this.licenses);
	}

	getUsage(key: string): LicenseUsage | null {
		const license = this.licenses.get(key);
		if (!license) return null;
		return { callsToday: license.usageCount || 0, tier: license.tier, key: license.key };
	}

	async createLicense(input: CreateLicenseInput): Promise<License> {
		const license = buildLicenseFromInput(input);
		this.licenses.set(license.id, license);
		saveToFile(this.licenses);
		return license;
	}

	getLicense(id: string): License | undefined { return this.licenses.get(id); }

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
}
