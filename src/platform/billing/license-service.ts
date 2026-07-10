/**
 * License Service
 * ROIaaS Phase 2 - License CRUD and key generation
 * Storage: JSON file persistence (no additional deps required)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
	License,
	LicenseTier,
	LicenseStatus,
	CreateLicenseInput,
	LicenseFilters,
	LicenseListResponse,
} from '../../shared/types/license';

const LICENSE_PREFIX = 'raas';
const TIER_PREFIXES: Record<LicenseTier, string> = {
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

/** Path to the JSON file storing licenses. Configurable via env var. */
const STORE_PATH = process.env.LICENSE_STORE_PATH || path.join(process.cwd(), 'data', 'licenses.json');

/** Persist in-memory map to JSON file */
function saveToFile(licenses: Map<string, License>): void {
	const dir = path.dirname(STORE_PATH);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const data = JSON.stringify(Array.from(licenses.entries()), null, 2);
	fs.writeFileSync(STORE_PATH, data, 'utf-8');
}

/** Load licenses from JSON file into a Map */
function loadFromFile(): Map<string, License> {
	try {
		if (!fs.existsSync(STORE_PATH)) return new Map();
		const raw = fs.readFileSync(STORE_PATH, 'utf-8');
		const entries: [string, License][] = JSON.parse(raw);
		return new Map(entries);
	} catch {
		// Corrupted file — start fresh
		return new Map();
	}
}

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
		const tierPrefix = TIER_PREFIXES[tier];
		const segment1 = this.generateRandomSegment(8);
		const segment2 = this.generateRandomSegment(8);
		return `${LICENSE_PREFIX}-${tierPrefix}-${segment1}-${segment2}`.toUpperCase();
	}

	private generateRandomSegment(length: number): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUV0123456789';
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
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
			maxUsage: this.getDefaultMaxUsage(tierEnum),
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
			maxUsage: this.getDefaultMaxUsage(input.tier),
			tenantId: input.tenantId,
			domain: input.domain,
			expiresAt: input.expiresAt,
		};

		this.licenses.set(id, license);
		saveToFile(this.licenses);
		return license;
	}

	private getDefaultMaxUsage(tier: LicenseTier): number {
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

	getLicense(id: string): License | undefined {
		return this.licenses.get(id);
	}

	getLicenseByKey(key: string): License | undefined {
		for (const license of this.licenses.values()) {
			if (license.key === key) {
				return license;
			}
		}
		return undefined;
	}

	getLicenseBySubscription(subscriptionId: string): License | undefined {
		for (const license of this.licenses.values()) {
			if (license.subscriptionId === subscriptionId) {
				return license;
			}
		}
		return undefined;
	}

	async listLicenses(filters: LicenseFilters = {}): Promise<LicenseListResponse> {
		let result = Array.from(this.licenses.values());

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

	async revokeLicense(id: string): Promise<License | undefined> {
		const license = this.licenses.get(id);
		if (!license) {
			return undefined;
		}

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

	async getAnalytics() {
		const allLicenses = Array.from(this.licenses.values());

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

	private generateId(): string {
		return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
	}
}
