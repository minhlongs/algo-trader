/**
 * Referral Service
 * Business logic for referral program management
 */

import { referralRepository } from './referral-repository';
import { commissionCalculator } from './commission-calculator';
import { fraudDetector, FraudDetector, FraudDetectionConfig } from './fraud-detector';
import { logger } from '../../shared/utils/logger';
import type {
  ReferralCode,
  ReferralClick,
  ReferralStats,
  CommissionRecord,
  CommissionStatus,
} from './types';

export class ReferralService {
  private fraudDetector: FraudDetector;

  constructor(fraudConfig?: Partial<FraudDetectionConfig>) {
    this.fraudDetector = new FraudDetector(fraudConfig);
  }

  /**
   * Register a referral code for a tenant
   */
  async registerReferralCode(
    tenantId: string,
    customCode?: string,
    maxUses?: number
  ): Promise<ReferralCode> {
    const code = customCode || this.generateUniqueCode();

    // Validate code format
    if (!this.isValidCodeFormat(code)) {
      throw new Error('Invalid referral code format. Must be 8 alphanumeric characters.');
    }

    await referralRepository.insertReferralCodeRow(code, tenantId, true, maxUses);
    const createdCode = await referralRepository.getReferralCodeByTenant(tenantId);
    if (!createdCode) {
      throw new Error('Failed to create referral code');
    }
    return createdCode;
  }

  /**
   * Track a referral click with fraud detection
   */
  async trackReferralClick(
    code: string,
    ip: string,
    userAgent: string,
    metadata: Record<string, unknown> = {}
  ): Promise<ReferralClick> {
    // Validate code exists and is active
    const isValid = await referralRepository.isReferralCodeValid(code);
    if (!isValid) {
      throw new Error('Invalid or inactive referral code');
    }

    // Perform fraud detection
    const trackingId = await referralRepository.trackClick(code, ip, userAgent, metadata);

    // Run fraud analysis asynchronously (don't block the click tracking)
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
    if (!tracking) {
      throw new Error('Failed to retrieve tracking record');
    }
    return tracking;
  }

  /**
   * Mark a conversion (tenant signed up)
   */
  async recordConversion(
    trackingId: string,
    convertedTenantId: string,
    convertedUserId: string
  ): Promise<void> {
    await referralRepository.markConversion(trackingId, convertedTenantId, convertedUserId);

    // In a real system, we would calculate commission based on the tenant's subscription
    // For now, we'll create a pending commission record
    const tracking = await referralRepository.getTrackingById(trackingId);
    if (!tracking) {
      throw new Error('Tracking record not found');
    }

    // Commission would be calculated when billing generates revenue
    // Here we just note the conversion
    logger.info('[Referral] Conversion recorded', {
      trackingId,
      convertedTenantId,
      referredBy: tracking.code,
    });
  }

  /**
   * Get referral statistics for a tenant
   */
  async getReferralStats(tenantId: string): Promise<ReferralStats | null> {
    return referralRepository.getStats(tenantId);
  }

  /**
   * Get commission records for a tenant
   */
  async getCommissions(
    tenantId: string,
    status?: CommissionStatus,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ commissions: CommissionRecord[]; total: number }> {
    return referralRepository.getCommissions(tenantId, status, limit, offset);
  }

  /**
   * Process monthly commissions for a referrer
   * Called when a referred tenant pays their invoice
   */
  async processCommission(
    trackingId: string,
    revenueAmount: number
  ): Promise<CommissionRecord> {
    const tracking = await referralRepository.getTrackingById(trackingId);
    if (!tracking) {
      throw new Error('Tracking record not found');
    }

    // Check if conversion exists
    if (!tracking.convertedTenantId) {
      throw new Error('No conversion recorded for this tracking ID');
    }

    // Calculate commission
    const commissionAmount = commissionCalculator.calculateCommission(revenueAmount);

    // Determine period (previous month)
    const period = commissionCalculator.getPreviousMonthPeriod();

    // Get referring tenant ID from the code
    const code = await referralRepository.getReferralCodeByCode(tracking.code);
    if (!code) {
      throw new Error('Referral code not found');
    }

    // Create commission record
    const commissionId = await referralRepository.createCommission(
      code.tenantId,
      trackingId,
      commissionAmount,
      commissionCalculator.calculateCommissionWithRate(1, 0.10), // 10%
      period.start,
      period.end,
      'pending'
    );

    // Update tracking with revenue and commission
    await referralRepository.updateTrackingRevenue(trackingId, revenueAmount, commissionAmount);

    const commissionsResult = await referralRepository.getCommissions(code.tenantId);
    const commission = commissionsResult.commissions.find(c => c.id === commissionId);
    if (!commission) {
      throw new Error('Commission record not found after creation');
    }

    logger.info('[Referral] Commission processed', {
      commissionId,
      trackingId,
      amount: commissionAmount,
      tenantId: code.tenantId,
    });

    return commission;
  }

  /**
   * Run monthly payout job
   * Finds all pending commissions from the previous month and marks them as approved
   * (In production, this would also trigger Stripe payouts)
   */
  async runMonthlyPayout(): Promise<{
    processed: number;
    totalAmount: number;
    errors: Array<{ tenantId: string; error: string }>;
  }> {
    logger.info('[Referral] Starting monthly payout job');

    const period = commissionCalculator.getPreviousMonthPeriod();
    const minPayoutAmount = 10; // Minimum $10 to process

    try {
      const pending = await referralRepository.getPendingCommissions(
        period.start,
        period.end,
        minPayoutAmount
      );

      logger.info('[Referral] Found pending payouts', {
        tenantCount: pending.length,
        period: `${period.start.toISOString().split('T')[0]} to ${period.end.toISOString().split('T')[0]}`,
      });

      let processed = 0;
      let totalAmount = 0;
      const errors: Array<{ tenantId: string; error: string }> = [];

      for (const payout of pending) {
        try {
          // Get all commission IDs for this tenant
          // In production, integrate with Stripe Connect here
          await this.approveCommissions(payout.commissions);
          processed += payout.commissions.length;
          totalAmount += payout.amount;

          logger.info('[Referral] Payout approved', {
            tenantId: payout.tenantId,
            amount: payout.amount,
            commissionCount: payout.commissions.length,
          });
        } catch (err) {
          errors.push({
            tenantId: payout.tenantId,
            error: err instanceof Error ? err.message : String(err),
          });
          logger.error('[Referral] Payout failed', { tenantId: payout.tenantId, error: err });
        }
      }

      return { processed, totalAmount, errors };
    } catch (error) {
      logger.error('[Referral] Monthly payout job failed', { error });
      throw error;
    }
  }

  /**
   * Approve a batch of commissions
   */
  private async approveCommissions(commissionIds: string[]): Promise<void> {
    for (const id of commissionIds) {
      await referralRepository.updateCommissionStatus(id, 'approved');
    }
  }

  /**
   * Generate a unique 8-character alphanumeric code
   */
  private generateUniqueCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Validate code format
   */
  private isValidCodeFormat(code: string): boolean {
    return /^[A-Z0-9]{8}$/.test(code);
  }

  /**
   * Get a referral code by its code string
   */
  async getReferralCodeByCode(code: string): Promise<ReferralCode | null> {
    return referralRepository.getReferralCodeByCode(code);
  }

  /**
   * Get clicks for a specific referral code
   */
  async getClicks(code: string, limit: number = 50, offset: number = 0): Promise<ReferralClick[]> {
    return referralRepository.getClicksByCode(code, limit, offset);
  }

  /**
   * Get a tenant's referral code
   */
  async getReferralCode(tenantId: string): Promise<ReferralCode | null> {
    return referralRepository.getReferralCodeByTenant(tenantId);
  }

  /**
   * Get all tracking for a tenant
   */
  async getTracking(tenantId: string, limit: number = 50, offset: number = 0): Promise<ReferralClick[]> {
    return referralRepository.getTrackingByTenant(tenantId, limit, offset);
  }

  /**
   * Run fraud detection batch job
   */
  async runFraudDetection(limit: number = 1000): Promise<{
    analyzed: number;
    flagged: number;
    averageScore: number;
  }> {
    return fraudDetector.batchAnalyzeClicks(limit);
  }
}

export const referralService = new ReferralService();
