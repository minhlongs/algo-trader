import { logger } from '../../../shared/utils/logger';
import type { TenantRepository, TenantRow } from '../repositories/tenant-repository';
import type { ProviderRepository, ProviderRow } from '../repositories/provider-repository';
import type { StrategyVersionRepository } from '../repositories/strategy-version-repository';

export interface CreateTenantInput {
 id: string;
 name: string;
 slug: string;
 plan?: string;
 status?: string;
 settings?: Record<string, unknown>;
}

export interface CreateProviderInput {
 id: string;
 tenantId: string;
 userId: string;
 displayName: string;
 bio?: string;
 payoutAddress?: string;
 status?: string;
}

export interface ProviderDashboardMetrics {
 provider: ProviderRow;
 earningsCents: number;
 subscriberCount: number;
 activeStrategies: number;
 totalRevenueCents: number;
 pendingSettlementCents: number;
}

export class ProviderService {
 private static instance: ProviderService | null = null;
 private readonly tenants: TenantRepository;
 private readonly providers: ProviderRepository;
 private readonly versions: StrategyVersionRepository;

 private constructor() {
 this.tenants = new (require('../repositories/tenant-repository').TenantRepository)();
 this.providers = new (require('../repositories/provider-repository').ProviderRepository)();
 this.versions = new (require('../repositories/strategy-version-repository').StrategyVersionRepository)();
 }

 static getInstance(): ProviderService {
 if (!ProviderService.instance) {
 ProviderService.instance = new ProviderService();
 }
 return ProviderService.instance;
 }

 static resetInstance(): void {
 ProviderService.instance = null;
 }

 async registerTenant(input: CreateTenantInput): Promise<TenantRow> {
 if (await this.tenants.exists(input.slug)) {
 throw new Error(`Tenant slug "${input.slug}" already exists`);
 }
 return this.tenants.upsert({
 id: input.id,
 name: input.name,
 slug: input.slug,
 plan: input.plan,
 status: input.status,
 settings: input.settings,
 });
 }

 async registerProvider(input: CreateProviderInput): Promise<ProviderRow> {
 const existing = await this.providers.findByTenant(input.tenantId);
 if (existing) return existing;
 return this.providers.create({
 id: input.id,
 tenantId: input.tenantId,
 userId: input.userId,
 displayName: input.displayName,
 bio: input.bio,
 payoutAddress: input.payoutAddress,
 status: input.status,
 });
 }

 async getDashboard(tenantId: string): Promise<ProviderDashboardMetrics> {
 const provider = await this.providers.findByTenant(tenantId);
 if (!provider) throw new Error('Provider profile not found');

 const versionCount = await this.versions.countByTenant(tenantId);

 return {
 provider,
 earningsCents: 0,
 subscriberCount: 0,
 activeStrategies: versionCount,
 totalRevenueCents: 0,
 pendingSettlementCents: 0,
 };
 }

 async updateProviderProfile(
 id: string,
 data: {
 displayName?: string;
 bio?: string | null;
 payoutAddress?: string | null;
 },
 ): Promise<ProviderRow | null> {
 return this.providers.update(id, data);
 }
}

export default ProviderService.getInstance();
