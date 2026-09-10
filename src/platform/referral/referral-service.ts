/**
 * Referral Service
 * Business logic for referral program management
 */

import { referralRepository } from './referral-repository';
import { commissionCalculator } from './commission-calculator';
import { fraudDetector, FraudDetector, FraudDetectionConfig } from './fraud-detector';
import { logger } from '../../shared/utils/logger';
import { runMonthlyPayout } from './referral-payout-job';
import { generateUniqueCode, isValidCodeFormat } from './referral-code-helpers';
import type {
  ReferralCode,
  ReferralClick,
  ReferralStats,
  CommissionRecord,
  CommissionStatus,
} from './types';

// Re-export submodules for full backward compatibility
export * from './referral-payout-job';
export * from './referral-code-helpers';

export class ReferralService {
  private fraudDetector: FraudDetector;

  constructor(fraudConfig?: Partial<FraudDetectionConfig>) {
    this.fraudDetector = new FraudDetector(fraudConfig);
  }

  /** Register a referral code for a tenant */
  async registerReferralCode(
    tenantId: string,
    customCode?: string,
    maxUses?: number
  ): Promise<ReferralCode> {
    const code = customCode || this.generateUniqueCode();

    if (!this.isValidCodeFormat(code)) {
      throw new Error('Invalid referral code format. Must be 8 alphanumeric characters.');
    }

    await referralRepository.createReferralCode(code, tenantId, true, maxUses);
    const createdCode = await referralRepository.getReferralCodeByTenant(tenantId);
    if (!createdCode) throw new Error('Failed to create referral code');
    return createdCode;
  }

  /** Track a referral click with fraud detection */
  async trackReferralClick(
    code: string,
    ip: string,
    userAgent: string,
    metadata: Record<string, unknown> = {}
  ): Promise<ReferralClick> {
    const isValid = await referralRepository.isReferralCodeValid(code);
    if (!isValid) throw new Error('Invalid or inactive referral code');

    const trackingId = await referralRepository.trackClick(code, ip, userAgent, metadata);

    this.fraudDetector.detectFraud(trackingId, ip, userAgent)
      .then(result => {
        logger.info('[Referral] Fraud analysis complete', {
          trackingId,
          score: result.score,
          isBlocked: result.isBlocked,
          reasons: result.reasons,
        });
      })
      .catch(err => {
        logger.error('[Referral] Fraud detection error', { error: err, trackingId });
      });

    const tracking = await referralRepository.getTrackingById(trackingId);
    if (!tracking) throw new Error('Failed to retrieve tracking record');
    return tracking;
  }

  /** Mark a conversion (tenant signed up) */
  async recordConversion(
    trackingId: string,
    convertedTenantId: string,
    convertedUserId: string
  ): Promise<void> {
    await referralRepository.markConversion(trackingId, convertedTenantId, convertedUserId);

    const tracking = await referralRepository.getTrackingById(trackingId);
    if (!tracking) throw new Error('Tracking record not found');

    logger.info('[Referral] Conversion recorded', {
      trackingId,
      convertedTenantId,
      referredBy: tracking.code,
    });
  }

  /** Get referral statistics for a tenant */
  async getReferralStats(tenantId: string): Promise<ReferralStats | null> {
    return referralRepository.getStats(tenantId);
  }

  /** Get commission records for a tenant */
  async getCommissions(
    tenantId: string,
    status?: CommissionStatus,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ commissions: CommissionRecord[]; total: number }> {
    return referralRepository.getCommissions(tenantId, status, limit, offset);
  }

  /** Process monthly commissions for a referrer */
  async processCommission(trackingId: string, revenueAmount: number): Promise<CommissionRecord> {
    const tracking = await referralRepository.getTrackingById(trackingId);
    if (!tracking) throw new Error('Tracking record not found');
    if (!tracking.convertedTenantId) throw new Error('No conversion recorded for this tracking ID');

    const commissionAmount = commissionCalculator.calculateCommission(revenueAmount);
    const period = commissionCalculator.getPreviousMonthPeriod();

    const code = await referralRepository.getReferralCodeByCode(tracking.code);
    if (!code) throw new Error('Referral code not found');

    const commissionId = await referralRepository.createCommission(
      code.tenantId,
      trackingId,
      commissionAmount,
      commissionCalculator.calculateCommissionWithRate(1, 0.10),
      period.start,
      period.end,
      'pending'
    );

    await referralRepository.updateTrackingRevenue(trackingId, revenueAmount, commissionAmount);

    const commissionsResult = await referralRepository.getCommissions(code.tenantId);
    const commission = commissionsResult.commissions.find(c => c.id === commissionId);
    if (!commission) throw new Error('Commission record not found after creation');

    logger.info('[Referral] Commission processed', {
      commissionId,
      trackingId,
      amount: commissionAmount,
      tenantId: code.tenantId,
    });

    return commission;
  }

  /** Run monthly payout job */
  async runMonthlyPayout(): Promise<{
    processed: number;
    totalAmount: number;
    errors: Array<{ tenantId: string; error: string }>;
  }> {
    return runMonthlyPayout();
  }

  /** Generate a unique 8-character alphanumeric code */
  private generateUniqueCode(): string { return generateUniqueCode(); }

  /** Validate code format */
  private isValidCodeFormat(code: string): boolean { return isValidCodeFormat(code); }

  /** Get a referral code by its code string */
  async getReferralCodeByCode(code: string): Promise<ReferralCode | null> {
    return referralRepository.getReferralCodeByCode(code);
  }

  /** Get clicks for a specific referral code */
  async getClicks(code: string, limit: number = 50, offset: number = 0): Promise<ReferralClick[]> {
    return referralRepository.getClicksByCode(code, limit, offset);
  }

  /** Get a tenant's referral code */
  async getReferralCode(tenantId: string): Promise<ReferralCode | null> {
    return referralRepository.getReferralCodeByTenant(tenantId);
  }

  /** Get all tracking for a tenant */
  async getTracking(tenantId: string, limit: number = 50, offset: number = 0): Promise<ReferralClick[]> {
    return referralRepository.getTrackingByTenant(tenantId, limit, offset);
  }

  /** Run fraud detection batch job */
  async runFraudDetection(limit: number = 1000): Promise<{
    analyzed: number;
    flagged: number;
    averageScore: number;
  }> {
    return fraudDetector.batchAnalyzeClicks(limit);
  }
}

export const referralService = new ReferralService();
