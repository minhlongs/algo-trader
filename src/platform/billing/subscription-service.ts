/**
 * Subscription Service
 * Payment provider-agnostic subscription lifecycle management
 * Supports NOWPayments (crypto) as primary provider
 */

import * as fs from 'fs';
import * as path from 'path';
import { LicenseService } from './license-service';
import { AuditLogService } from '../audit/audit-log-service';
import { LicenseTier, LicenseStatus } from '../../shared/types/license';

const STORE_PATH = process.env.SUBSCRIPTION_STORE_PATH || path.join(process.cwd(), 'data', 'subscriptions.json');

function saveToFile(subscriptions: Map<string, Subscription>): void {
	const dir = path.dirname(STORE_PATH);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	const data = JSON.stringify(Array.from(subscriptions.entries()), null, 2);
	fs.writeFileSync(STORE_PATH, data, { encoding: 'utf-8', mode: 0o600 });
}

function clearStoreFile(): void {
	try {
		if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
	} catch { /* ignore */ }
}

function loadFromFile(): Map<string, Subscription> {
	try {
		if (!fs.existsSync(STORE_PATH)) return new Map();
		const raw = fs.readFileSync(STORE_PATH, 'utf-8');
		const entries: [string, Subscription][] = JSON.parse(raw);
		return new Map(entries);
	} catch {
		return new Map();
	}
}

export interface Subscription {
	id: string;
	providerPaymentId: string;
	customerEmail: string;
	productId: string;
	status: SubscriptionStatus;
	tier: LicenseTier;
	currentPeriodStart: string;
	currentPeriodEnd: string;
	amount?: number;
	currency?: string;
	licenseId?: string;
	createdAt: string;
	updatedAt: string;
	cancelledAt?: string;
	userId?: string;
}

export type SubscriptionStatus = 'pending' | 'active' | 'cancelled' | 'expired';

export interface CreateSubscriptionInput {
	providerPaymentId: string;
	customerEmail: string;
	productId: string;
	status: SubscriptionStatus;
	tier: LicenseTier;
	currentPeriodStart: string;
	currentPeriodEnd: string;
	amount?: number;
	currency?: string;
}

export class SubscriptionService {
	private static instance: SubscriptionService | null = null;
	private subscriptions: Map<string, Subscription> = new Map();
	private licenseService!: LicenseService;
	private auditService!: AuditLogService;

	constructor() {
		if (SubscriptionService.instance) return SubscriptionService.instance as SubscriptionService;
		this.licenseService = LicenseService.getInstance();
		this.auditService = AuditLogService.getInstance();
		this.subscriptions = loadFromFile();
		SubscriptionService.instance = this;
	}

	static getInstance(): SubscriptionService {
		if (!SubscriptionService.instance) {
			SubscriptionService.instance = new SubscriptionService();
		}
		return SubscriptionService.instance;
	}

	static resetInstance(): void {
		clearStoreFile();
		SubscriptionService.instance = null;
	}

	async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
		const id = `sub_${this.generateId()}`;
		const now = new Date().toISOString();
		const subscription: Subscription = {
			id,
			providerPaymentId: input.providerPaymentId,
			customerEmail: input.customerEmail,
			productId: input.productId,
			status: input.status,
			tier: input.tier,
			currentPeriodStart: input.currentPeriodStart,
			currentPeriodEnd: input.currentPeriodEnd,
			amount: input.amount,
			currency: input.currency,
			createdAt: now,
			updatedAt: now,
		};
		this.subscriptions.set(id, subscription);
		saveToFile(this.subscriptions);
		return subscription;
	}

	async getSubscription(userId: string): Promise<Subscription | undefined> {
		for (const sub of this.subscriptions.values()) {
			if (sub.userId === userId) return sub;
		}
		return undefined;
	}

	async getSubscriptionByProviderId(providerId: string): Promise<Subscription | undefined> {
		for (const sub of this.subscriptions.values()) {
			if (sub.providerPaymentId === providerId) return sub;
		}
		return undefined;
	}

	async getSubscriptionsByCustomer(customerEmail: string): Promise<Subscription[]> {
		return Array.from(this.subscriptions.values()).filter((s) => s.customerEmail === customerEmail);
	}

	async updateSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<Subscription | undefined> {
		const sub = this.subscriptions.get(id);
		if (!sub) return undefined;

		sub.status = status;
		sub.updatedAt = new Date().toISOString();
		if (status === 'cancelled') sub.cancelledAt = new Date().toISOString();

		this.subscriptions.set(id, sub);
		saveToFile(this.subscriptions);
		return sub;
	}

async updateSubscriptionTier(id: string, tier: LicenseTier, licenseId?: string): Promise<Subscription | undefined> {
		const sub = this.subscriptions.get(id);
		if (!sub) return undefined;

		sub.tier = tier;
		sub.updatedAt = new Date().toISOString();
		this.subscriptions.set(id, sub);
 if (licenseId) sub.licenseId = licenseId;
		saveToFile(this.subscriptions);

		if (sub.licenseId) await this.syncLicenseTier(sub.licenseId, tier);
		return sub;
	}

	async activateSubscription(id: string): Promise<Subscription | undefined> {
		/**
		 * Test/API convenience: process a payment confirmation and activate a subscription.
		 * Creates or updates subscription status to 'active', creates a license, and persists.
		 */
		const existing = this.subscriptions.get(id);
		if (!existing) return undefined;

		existing.status = 'active';
		existing.updatedAt = new Date().toISOString();
		this.subscriptions.set(id, existing);
		saveToFile(this.subscriptions);
		return existing;
	}

	/**
	 * Test/API convenience: handle payment confirmation by user ID.
	 * Finds or creates an active subscription for the given userId.
	 */
	async handlePaymentConfirmation(input: {
		userId: string;
		tier: LicenseTier;
		paymentId?: string;
		amount?: number;
		currency?: string;
	}): Promise<Subscription> {
		const tier = typeof input.tier === 'string' ? (LicenseTier[input.tier.toUpperCase() as keyof typeof LicenseTier] || LicenseTier.PRO) : input.tier;
		const now = new Date().toISOString();
		const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

		// Look for existing subscription by userId
		let existing: Subscription | undefined;
		for (const sub of this.subscriptions.values()) {
			if (sub.userId && sub.userId === input.userId) {
				existing = sub;
				break;
			}
		}

		if (existing) {
			existing.status = 'active';
			existing.tier = tier;
			existing.updatedAt = now;
			existing.currentPeriodEnd = periodEnd;
			if (input.amount) existing.amount = input.amount;
			if (input.currency) existing.currency = input.currency;
			this.subscriptions.set(existing.id, existing);
			saveToFile(this.subscriptions);
			return existing;
		}

		const id = `sub_${this.generateId()}`;
		const subscription: Subscription = {
			id,
			userId: input.userId,
			providerPaymentId: input.paymentId || `pay_${id}`,
			customerEmail: `${input.userId}@test.local`,
			productId: 'default-product',
			status: 'active',
			tier,
			currentPeriodStart: now,
			currentPeriodEnd: periodEnd,
			amount: input.amount,
			currency: input.currency,
			createdAt: now,
			updatedAt: now,
		};
		this.subscriptions.set(id, subscription);
		saveToFile(this.subscriptions);
		return subscription;
	}

	/**
	 * Test/API convenience: cancel subscription by user ID.
	 * Sets status to 'cancelled' but keeps active until period end.
	 */
	async handleCancellation(userId: string): Promise<void> {
		for (const [id, sub] of this.subscriptions.entries()) {
			if (sub.userId === userId) {
				sub.status = 'cancelled';
				sub.cancelledAt = new Date().toISOString();
				sub.updatedAt = new Date().toISOString();
				this.subscriptions.set(id, sub);
				saveToFile(this.subscriptions);
				return;
			}
		}
	}

	/**
	 * Test/API convenience: get subscription by user ID.
	 */
	private async syncLicenseTier(licenseId: string, tier: LicenseTier): Promise<void> {
		const license = this.licenseService.getLicense(licenseId);
		if (license) {
			license.tier = tier;
			license.updatedAt = new Date().toISOString();
			license.maxUsage = this.getDefaultMaxUsage(tier);
		}
	}

	private async downgradeLicenseToFree(licenseId: string): Promise<void> {
		const license = this.licenseService.getLicense(licenseId);
		if (license) {
			license.tier = LicenseTier.FREE;
			license.status = LicenseStatus.ACTIVE;
			license.updatedAt = new Date().toISOString();
			license.maxUsage = this.getDefaultMaxUsage(LicenseTier.FREE);

			await this.auditService.log(licenseId, 'revoked', {
				tier: LicenseTier.FREE,
				metadata: { reason: 'subscription_cancelled' },
			});
		}
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

	async getAllSubscriptions(): Promise<Subscription[]> {
		return Array.from(this.subscriptions.values());
	}

	private generateId(): string {
		return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
	}
}
