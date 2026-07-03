/**
 * Enterprise Inquiry Store
 * In-memory store for enterprise contact form submissions.
 * Enterprise tier: $99 / $299 / $999 per month — invoice-based, manual close.
 * No self-serve checkout; Polar.sh bypassed entirely for enterprise.
 */

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
  | 'new'         // just submitted
  | 'tam_notified' // TAM has been notified
  | 'contacted'   // TAM has reached out
  | 'demo_active' // paper demo running
  | 'negotiating' // in contract negotiation
  | 'closed_won'  // invoice signed
  | 'closed_lost'; // did not proceed

/** Singleton in-memory store; production would use a DB */
class EnterpriseInquiryStore {
  private static instance: EnterpriseInquiryStore;
  private inquiries: Map<string, EnterpriseInquiry> = new Map();

  static getInstance(): EnterpriseInquiryStore {
    if (!EnterpriseInquiryStore.instance) {
      EnterpriseInquiryStore.instance = new EnterpriseInquiryStore();
    }
    return EnterpriseInquiryStore.instance;
  }

  create(input: Omit<EnterpriseInquiry, 'id' | 'status' | 'paperdemoProvisioned' | 'createdAt' | 'updatedAt'>): EnterpriseInquiry {
    const now = new Date().toISOString();
    const inquiry: EnterpriseInquiry = {
      id: `enq_${crypto.randomUUID()}`,
      ...input,
      status: 'new',
      paperdemoProvisioned: false,
      createdAt: now,
      updatedAt: now,
    };
    this.inquiries.set(inquiry.id, inquiry);
    return inquiry;
  }

  getById(id: string): EnterpriseInquiry | undefined {
    return this.inquiries.get(id);
  }

  getByEmail(email: string): EnterpriseInquiry[] {
    return Array.from(this.inquiries.values()).filter((i) => i.email === email);
  }

  list(): EnterpriseInquiry[] {
    return Array.from(this.inquiries.values()).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    );
  }

  update(id: string, patch: Partial<Pick<EnterpriseInquiry, 'status' | 'tamAssigned' | 'paperdemoProvisioned' | 'paperdemoKey' | 'notes'>>): EnterpriseInquiry | undefined {
    const inquiry = this.inquiries.get(id);
    if (!inquiry) return undefined;
    const updated: EnterpriseInquiry = {
      ...inquiry,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.inquiries.set(id, updated);
    return updated;
  }
}

export const enterpriseInquiryStore = EnterpriseInquiryStore.getInstance();
