/**
 * Referral Repository (Facade)
 * Thin facade delegating to referral-crud and referral-analytics sub-modules.
 * Preserves the singleton pattern for backward compatibility.
 */

import type { ReferralCode, ReferralClick, ReferralStats, CommissionStatus } from './types';
import * as crud from './referral-crud';
import * as analytics from './referral-analytics';

export class ReferralRepository {
  // ── Code CRUD ──────────────────────────────────────────
  async insertReferralCodeRow(code: string, tenantId: string, isActive = true, maxUses: number | null = null) {
    return crud.insertReferralCodeRow(code, tenantId, isActive, maxUses);
  }
  async createReferralCode(tenantId: string): Promise<ReferralCode> {
    return crud.createReferralCode(tenantId);
  }
  async getReferralCodeByTenant(tenantId: string): Promise<ReferralCode | null> {
    return crud.getReferralCodeByTenant(tenantId);
  }
  async getReferralCodeByCode(code: string): Promise<ReferralCode | null> {
    return crud.getReferralCodeByCode(code);
  }
  async isReferralCodeValid(code: string): Promise<boolean> {
    return crud.isReferralCodeValid(code);
  }
  async incrementUsedCount(code: string): Promise<void> {
    return crud.incrementUsedCount(code);
  }

  // ── Tracking CRUD ──────────────────────────────────────
  async trackClick(code: string, ip: string, userAgent: string, metadata: Record<string, unknown> = {}, fraudScore = 0, isFraudulent = false) {
    return crud.trackClick(code, ip, userAgent, metadata, fraudScore, isFraudulent);
  }
  async markConversion(trackingId: string, convertedTenantId: string, convertedUserId: string) {
    return crud.markConversion(trackingId, convertedTenantId, convertedUserId);
  }
  async getTrackingById(trackingId: string): Promise<ReferralClick | null> {
    return crud.getTrackingById(trackingId);
  }
  async updateTrackingRevenue(trackingId: string, revenue: number, commission: number) {
    return crud.updateTrackingRevenue(trackingId, revenue, commission);
  }

  // ── Commission CRUD ────────────────────────────────────
  async createCommission(tenantId: string, trackingId: string, amount: number, feePercentage: number, periodStart: Date, periodEnd: Date, status: CommissionStatus = 'pending') {
    return crud.createCommission(tenantId, trackingId, amount, feePercentage, periodStart, periodEnd, status);
  }
  async updateCommissionStatus(commissionId: string, status: CommissionStatus, stripePayoutId?: string) {
    return crud.updateCommissionStatus(commissionId, status, stripePayoutId);
  }

  // ── Analytics ──────────────────────────────────────────
  async getClicksByCode(code: string, limit = 50, offset = 0): Promise<ReferralClick[]> {
    return analytics.getClicksByCode(code, limit, offset);
  }
  async getTrackingByTenant(tenantId: string, limit = 50, offset = 0): Promise<ReferralClick[]> {
    return analytics.getTrackingByTenant(tenantId, limit, offset);
  }
  async getStats(tenantId: string): Promise<ReferralStats | null> {
    return analytics.getReferralStats(tenantId);
  }
  async getCommissions(tenantId: string, status?: CommissionStatus, limit = 50, offset = 0) {
    return analytics.getCommissions(tenantId, status, limit, offset);
  }
  async getPendingCommissions(periodStart: Date, periodEnd: Date, minAmount = 10) {
    return analytics.getPendingCommissions(periodStart, periodEnd, minAmount);
  }
}

export const referralRepository = new ReferralRepository();
