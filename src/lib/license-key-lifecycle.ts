/**
 * License Key Lifecycle
 * Creation, activation, expiry, invites, email templates, in-memory store.
 * Split from license-keys.ts for 200-line modularization.
 */

import crypto from 'crypto';
import {
  generateLicenseKey,
  type LicenseKey,
  type BetaInvite,
} from './license-key-crypto.js';

/** Get default max usage based on tier */
export function getDefaultMaxUsage(tier: 'free' | 'pro' | 'enterprise'): number {
  switch (tier) {
    case 'free': return 100;
    case 'pro': return 10000;
    case 'enterprise': return 100000;
  }
}

/** Create a new license key */
export function createLicenseKey(
  email: string,
  tier: 'free' | 'pro' | 'enterprise' = 'free',
  options?: { maxUsage?: number; expiresAt?: string; metadata?: Record<string, string> },
): LicenseKey {
  return {
    id: `lic_${crypto.randomBytes(8).toString('hex')}`,
    key: generateLicenseKey(tier),
    tier,
    status: 'pending',
    email,
    createdAt: new Date().toISOString(),
    usageCount: 0,
    maxUsage: options?.maxUsage || getDefaultMaxUsage(tier),
    expiresAt: options?.expiresAt,
    metadata: options?.metadata,
  };
}

/** Create beta invite (7-day expiry) */
export function createBetaInvite(email: string, licenseKeyId: string): BetaInvite {
  const now = new Date();
  return {
    id: `invite_${crypto.randomBytes(8).toString('hex')}`,
    email,
    licenseKeyId,
    status: 'sent',
    sentAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 86400_000).toISOString(),
  };
}

/** Activate a pending license key */
export function activateLicenseKey(license: LicenseKey): LicenseKey {
  if (license.status !== 'pending') {
    throw new Error(`License is not pending (current status: ${license.status})`);
  }
  license.status = 'active';
  license.activatedAt = new Date().toISOString();
  return license;
}

/** Check if license is expired */
export function isLicenseExpired(license: LicenseKey): boolean {
  if (!license.expiresAt) return false;
  return new Date(license.expiresAt) < new Date();
}

/** Generate invitation email content */
export function generateInviteEmail(
  email: string,
  licenseKey: string,
  inviteUrl: string,
): { subject: string; html: string; text: string } {
  const subject = 'You\'re invited to Algo Trader Beta!';
  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:30px;border-radius:10px 10px 0 0;text-align:center">
    <h1>Welcome to Algo Trader Beta!</h1>
  </div>
  <div style="background:#f8f9fa;padding:30px;border-radius:0 0 10px 10px">
    <p>Hi there, your exclusive license key:</p>
    <div style="background:white;padding:15px;border-radius:5px;font-family:monospace;font-size:16px;text-align:center;border:2px dashed #667eea;margin:20px 0;word-break:break-all">${licenseKey}</div>
    <p style="text-align:center"><a href="${inviteUrl}" style="display:inline-block;background:#667eea;color:white;padding:12px 30px;text-decoration:none;border-radius:5px">Activate License</a></p>
    <p style="text-align:center;color:#666;font-size:14px">This invite expires in 7 days.</p>
  </div>
</div>`.trim();
  const text = `Welcome to Algo Trader Beta!\n\nYour license key: ${licenseKey}\n\nActivate: ${inviteUrl}\n\nExpires in 7 days.`;
  return { subject, html, text };
}

/** In-memory license store (replace with DB in production) */
export class LicenseStore {
  private static instance: LicenseStore;
  private licenses: Map<string, LicenseKey> = new Map();
  private invites: Map<string, BetaInvite> = new Map();
  private byKey: Map<string, string> = new Map();
  private byEmail: Map<string, string> = new Map();

  private constructor() {}

  static getInstance(): LicenseStore {
    if (!LicenseStore.instance) LicenseStore.instance = new LicenseStore();
    return LicenseStore.instance;
  }

  saveLicense(license: LicenseKey): void {
    this.licenses.set(license.id, license);
    this.byKey.set(license.key, license.id);
    if (license.email) this.byEmail.set(license.email, license.id);
  }

  saveInvite(invite: BetaInvite): void { this.invites.set(invite.id, invite); }
  getLicense(id: string): LicenseKey | undefined { return this.licenses.get(id); }
  getLicenseByKey(key: string): LicenseKey | undefined {
    const id = this.byKey.get(key);
    return id ? this.licenses.get(id) : undefined;
  }
  getLicenseByEmail(email: string): LicenseKey | undefined {
    const id = this.byEmail.get(email);
    return id ? this.licenses.get(id) : undefined;
  }
  getInvite(id: string): BetaInvite | undefined { return this.invites.get(id); }
  listLicenses(): LicenseKey[] { return Array.from(this.licenses.values()); }
  listInvites(): BetaInvite[] { return Array.from(this.invites.values()); }
}
