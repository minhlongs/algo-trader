/**
 * Enterprise Inquiry Store
 * PostgreSQL-backed store for enterprise contact form submissions.
 * Enterprise tier: $99 / $299 / $999 per month — invoice-based, manual close.
 * No self-serve checkout; Polar.sh bypassed entirely for enterprise.
 */

import { query } from '../../shared/db/postgres-client';
import * as crypto from 'crypto';

export type EnterpriseTier = 'PRO' | 'ENTERPRISE' | 'MASTER';

/** Monthly price per tier (these are recurring monthly rates, not annual ACV) */
export const ENTERPRISE_MONTHLY_PRICE: Record<EnterpriseTier, number> = {
  PRO: 99,
  ENTERPRISE: 299,
  MASTER: 999,
};

export const ENTERPRISE_TIER_LABELS: Record<EnterpriseTier, string> = {
  PRO: 'PRO — $99/mo',
  ENTERPRISE: 'ENTERPRISE — $299/mo',
  MASTER: 'MASTER — $999/mo',
};

export interface EnterpriseInquiry {
  id: string;
  email: string;
  companyName: string;
  contactName: string;
  tier: EnterpriseTier;
  useCase: string;
  teamSize?: string;
  status: EnterpriseInquiryStatus;
  tamAssigned?: string;
  paperdemoProvisioned: boolean;
  paperdemoKey?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export type EnterpriseInquiryStatus =
  | 'new'
  | 'tam_notified'
  | 'contacted'
  | 'demo_active'
  | 'negotiating'
  | 'closed_won'
  | 'closed_lost';

interface EnterpriseInquiryRow {
  id: string;
  email: string;
  company_name: string;
  contact_name: string;
  tier: string;
  use_case: string;
  team_size: string | null;
  status: string;
  tam_assigned: string | null;
  paperdemo_provisioned: boolean;
  paperdemo_key: string | null;
  created_at: Date;
  updated_at: Date;
  notes: string | null;
}

function rowToEnterpriseInquiry(row: EnterpriseInquiryRow): EnterpriseInquiry {
  return {
    id: row.id,
    email: row.email,
    companyName: row.company_name,
    contactName: row.contact_name,
    tier: row.tier as EnterpriseTier,
    useCase: row.use_case,
    teamSize: row.team_size ?? undefined,
    status: row.status as EnterpriseInquiryStatus,
    tamAssigned: row.tam_assigned ?? undefined,
    paperdemoProvisioned: row.paperdemo_provisioned,
    paperdemoKey: row.paperdemo_key ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    notes: row.notes ?? undefined,
  };
}

/** Singleton store backed by PostgreSQL */
class EnterpriseInquiryStore {
  private static instance: EnterpriseInquiryStore;

  static getInstance(): EnterpriseInquiryStore {
    if (!EnterpriseInquiryStore.instance) {
      EnterpriseInquiryStore.instance = new EnterpriseInquiryStore();
    }
    return EnterpriseInquiryStore.instance;
  }

  async create(input: Omit<EnterpriseInquiry, 'id' | 'status' | 'paperdemoProvisioned' | 'createdAt' | 'updatedAt'>): Promise<EnterpriseInquiry> {
    const now = new Date();
    const id = `enq_${crypto.randomUUID()}`;

    const result = await query(
      `INSERT INTO enterprise_inquiries (id, email, company_name, contact_name, tier, use_case, team_size, status, paperdemo_provisioned, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        input.email,
        input.companyName,
        input.contactName,
        input.tier,
        input.useCase,
        input.teamSize ?? null,
        'new',
        false,
        now.toISOString(),
        now.toISOString(),
      ]
    );

    return rowToEnterpriseInquiry(result.rows[0] as unknown as EnterpriseInquiryRow);
  }

  async getById(id: string): Promise<EnterpriseInquiry | undefined> {
    const result = await query('SELECT * FROM enterprise_inquiries WHERE id = $1', [id]);
    if (result.rows.length === 0) return undefined;
    return rowToEnterpriseInquiry(result.rows[0] as unknown as EnterpriseInquiryRow);
  }

  async getByEmail(email: string): Promise<EnterpriseInquiry[]> {
    const result = await query('SELECT * FROM enterprise_inquiries WHERE email = $1 ORDER BY created_at DESC', [email]);
    return result.rows.map((r) => rowToEnterpriseInquiry(r as unknown as EnterpriseInquiryRow));
  }

  async list(): Promise<EnterpriseInquiry[]> {
    const result = await query('SELECT * FROM enterprise_inquiries ORDER BY created_at DESC');
    return result.rows.map((r) => rowToEnterpriseInquiry(r as unknown as EnterpriseInquiryRow));
  }

  async update(id: string, patch: Partial<Pick<EnterpriseInquiry, 'status' | 'tamAssigned' | 'paperdemoProvisioned' | 'paperdemoKey' | 'notes'>>): Promise<EnterpriseInquiry | undefined> {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (patch.status !== undefined) {
      sets.push(`status = $${paramIdx++}`);
      params.push(patch.status);
    }
    if (patch.tamAssigned !== undefined) {
      sets.push(`tam_assigned = $${paramIdx++}`);
      params.push(patch.tamAssigned);
    }
    if (patch.paperdemoProvisioned !== undefined) {
      sets.push(`paperdemo_provisioned = $${paramIdx++}`);
      params.push(patch.paperdemoProvisioned);
    }
    if (patch.paperdemoKey !== undefined) {
      sets.push(`paperdemo_key = $${paramIdx++}`);
      params.push(patch.paperdemoKey);
    }
    if (patch.notes !== undefined) {
      sets.push(`notes = $${paramIdx++}`);
      params.push(patch.notes);
    }

    if (sets.length === 0) return this.getById(id);

    sets.push(`updated_at = $${paramIdx++}`);
    params.push(now);

    params.push(id);
    const result = await query(
      `UPDATE enterprise_inquiries SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return undefined;
    return rowToEnterpriseInquiry(result.rows[0] as unknown as EnterpriseInquiryRow);
  }
}

export const enterpriseInquiryStore = EnterpriseInquiryStore.getInstance();
