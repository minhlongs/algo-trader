/**
 * License Service
 * ROIaaS Phase 2 - License CRUD and key generation
 * Storage: PostgreSQL via postgres-client
 */

import { query } from '../../shared/db/postgres-client';
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
  [LicenseTier.PRO]: 'rpp',
  [LicenseTier.ENTERPRISE]: 'rep',
  [LicenseTier.MASTER]: 'rmt',
};

function rowToLicense(row: any): License {
  const toDateString = (val: unknown): string | undefined => {
    if (!val) return undefined;
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val;
    return String(val);
  };

  return {
    id: row.id,
    name: row.name,
    key: row.key,
    tier: row.tier as LicenseTier,
    status: row.status as LicenseStatus,
    createdAt: toDateString(row.created_at) ?? new Date().toISOString(),
    expiresAt: toDateString(row.expires_at),
    usageCount: typeof row.usage_count === 'number' ? row.usage_count : Number(row.usage_count ?? 0),
    maxUsage: row.max_usage != null ? (typeof row.max_usage === 'number' ? row.max_usage : Number(row.max_usage)) : undefined,
    userId: row.user_id ?? undefined,
    updatedAt: toDateString(row.updated_at),
    domain: row.domain ?? undefined,
    overageUnits: row.overage_units != null ? Number(row.overage_units) : undefined,
    overageAllowed: row.overage_allowed ?? undefined,
    tenantId: row.tenant_id ?? undefined,
    subscriptionId: row.subscription_id ?? undefined,
  };
}

export class LicenseService {
  private static instance: LicenseService;

  private constructor() {
    // No in-memory state needed
  }

  static getInstance(): LicenseService {
    if (!LicenseService.instance) {
      LicenseService.instance = new LicenseService();
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
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async createLicense(input: CreateLicenseInput): Promise<License> {
    const id = `lic_${this.generateId()}`;
    const key = this.generateLicenseKey(input.tier);
    const now = new Date().toISOString();

    const result = await query(
      `INSERT INTO licenses (id, name, key, tier, status, created_at, updated_at, usage_count, max_usage, tenant_id, domain, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        id,
        input.name,
        key,
        input.tier,
        LicenseStatus.ACTIVE,
        now,
        now,
        0,
        this.getDefaultMaxUsage(input.tier),
        input.tenantId ?? null,
        input.domain ?? null,
        input.expiresAt ?? null,
      ]
    );

    return rowToLicense(result.rows[0]);
  }

  private getDefaultMaxUsage(tier: LicenseTier): number {
    switch (tier) {
      case LicenseTier.FREE:        return 100;
      case LicenseTier.PRO:         return 10000;
      case LicenseTier.ENTERPRISE:  return 100000;
      case LicenseTier.MASTER:      return 500000;
    }
  }

  async getLicense(id: string): Promise<License | undefined> {
    const result = await query('SELECT * FROM licenses WHERE id = $1', [id]);
    if (result.rows.length === 0) return undefined;
    return rowToLicense(result.rows[0]);
  }

  async getLicenseByKey(key: string): Promise<License | undefined> {
    const result = await query('SELECT * FROM licenses WHERE key = $1', [key]);
    if (result.rows.length === 0) return undefined;
    return rowToLicense(result.rows[0]);
  }

  async getLicenseBySubscription(subscriptionId: string): Promise<License | undefined> {
    const result = await query('SELECT * FROM licenses WHERE subscription_id = $1', [subscriptionId]);
    if (result.rows.length === 0) return undefined;
    return rowToLicense(result.rows[0]);
  }

  async listLicenses(filters: LicenseFilters = {}): Promise<LicenseListResponse> {
    const result = await query('SELECT * FROM licenses');
    let resultLicenses = result.rows.map(rowToLicense);

    if (filters.status && filters.status !== 'all') {
      resultLicenses = resultLicenses.filter((l) => l.status === filters.status);
    }

    if (filters.tier && filters.tier !== 'all') {
      resultLicenses = resultLicenses.filter((l) => l.tier === filters.tier);
    }

    const total = resultLicenses.length;
    const skip = filters.skip || 0;
    const take = filters.take || 10;

    resultLicenses = resultLicenses.slice(skip, skip + take);

    return {
      licenses: resultLicenses,
      total,
      hasMore: skip + take < total,
    };
  }

  async revokeLicense(id: string): Promise<License | undefined> {
    const now = new Date().toISOString();
    const result = await query(
      'UPDATE licenses SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *',
      [LicenseStatus.REVOKED, now, id]
    );
    if (result.rows.length === 0) return undefined;
    return rowToLicense(result.rows[0]);
  }

  async deleteLicense(id: string): Promise<boolean> {
    const result = await query('DELETE FROM licenses WHERE id = $1 RETURNING id', [id]);
    return result.rows.length > 0;
  }

  async getAnalytics() {
    const result = await query('SELECT * FROM licenses');
    const allLicenses = result.rows.map(rowToLicense);

    const byTier: Record<string, number> = {
      [LicenseTier.FREE]: allLicenses.filter((l) => l.tier === LicenseTier.FREE).length,
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
