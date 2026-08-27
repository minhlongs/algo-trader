/**
 * Referral Payout Module — Facade.
 *
 * Re-exports all public API from split modules. Class methods delegate to
 * helpers via `.call(this)`. Zero behavior change, zero importer edits.
 */

// ── Re-exports (facade) ──────────────────────────────────────────────────────
export {
  PayoutMethod,
  PayoutMethodConfig,
  ReferralEarnings,
  PayoutHistoryRecord,
  ProcessPayoutResult,
  PAYOUT_METHODS,
  PayoutStatus,
  type ReferralPayoutLike,
} from './referral-payout-types';

export { ensurePayoutTables } from './payout-tables';

export { calculatePayoutFee, generatePayoutId, generateTransactionId } from './payout-calculators';

export { getEarnings, getPayoutHistory } from './payout-read';

export { processPayout, executeTransfer } from './process-payout';

// ── Internal imports for class methods ───────────────────────────────────────
import { referralRepository } from './referral-repository';
import { query } from '../../shared/db/postgres-client.js';
import { logger } from '../../shared/utils/logger';
import { PAYOUT_METHODS } from './referral-payout-types';
import type { PayoutMethod, PayoutMethodConfig, ReferralEarnings, PayoutHistoryRecord, ProcessPayoutResult, PayoutStatus } from './referral-payout-types';
import { ensurePayoutTables } from './payout-tables';
import { calculatePayoutFee } from './payout-calculators';
import { getEarnings, getPayoutHistory } from './payout-read';
import { processPayout, executeTransfer } from './process-payout';

/* ── payout class ────────────────────────────────────────────────────────── */

export class ReferralPayout {
  /**
   * Get or initialize earnings record for a tenant
   */
  async getEarnings(tenantId: string): Promise<ReferralEarnings> {
    return getEarnings.call(this, tenantId);
  }

  /**
   * Set payout method and address for a tenant
   */
  async setPayoutMethod(
    tenantId: string,
    method: PayoutMethod,
    address: string,
  ): Promise<void> {
    await ensurePayoutTables();

    const config = PAYOUT_METHODS[method];
    if (!config) {
      throw new Error(`Invalid payout method: ${method}`);
    }

    await query(
      `INSERT INTO referral_earnings (tenant_id, payout_method, payout_address, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         payout_method = $2,
         payout_address = $3,
         updated_at = NOW()`,
      [tenantId, method, address],
    );

    logger.info('[ReferralPayout] Payout method set', { tenantId, method });
  }

  /**
   * Credit commission earnings to tenant balance
   */
  async creditEarnings(
    tenantId: string,
    commissionId: string,
    amount: number,
  ): Promise<void> {
    await ensurePayoutTables();

    await query(
      `INSERT INTO referral_earnings (tenant_id, total_earned, pending_balance, updated_at)
       VALUES ($1, $2, $2, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         total_earned = referral_earnings.total_earned + $2,
         pending_balance = referral_earnings.pending_balance + $2,
         updated_at = NOW()`,
      [tenantId, amount],
    );

    logger.info('[ReferralPayout] Earnings credited', {
      tenantId,
      commissionId,
      amount,
    });
  }

  /**
   * Get payout history for a tenant
   */
  async getPayoutHistory(
    tenantId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<PayoutHistoryRecord[]> {
    return getPayoutHistory.call(this, tenantId, limit, offset);
  }

  /**
   * Process a payout for a tenant
   * Delegates to processPayout helper via .call(this)
   */
  async processPayout(
    tenantId: string,
    commissionIds: string[],
  ): Promise<ProcessPayoutResult> {
    return processPayout.call(this, tenantId, commissionIds);
  }

  /**
   * Execute the actual fund transfer via the configured method.
   * Delegates to executeTransfer helper via .call(this)
   */
  async executeTransfer(
    method: PayoutMethod,
    address: string,
    amount: number,
  ): Promise<string> {
    return executeTransfer.call(this, method, address, amount);
  }

  /**
   * Get available payout methods and their configurations
   */
  getAvailableMethods(): PayoutMethodConfig[] {
    return Object.values(PAYOUT_METHODS);
  }

  /**
   * Calculate fee for a given amount and method
   */
  calculateFee(amount: number, method: PayoutMethod): { fee: number; net: number } {
    return calculatePayoutFee(amount, method);
  }
}

export const referralPayout = new ReferralPayout();