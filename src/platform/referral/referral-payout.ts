/**
 * Referral Payout Module
 * Separates payout logic from referral tracking.
 * Handles: earning calculation, payout processing, multiple payout methods,
 * and payout history management.
 */

import { referralRepository } from './referral-repository';
import { commissionCalculator } from './commission-calculator';
import { query } from '../../shared/db/postgres-client.js';
import { logger } from '../../shared/utils/logger';
import type { CommissionRecord, PayoutStatus } from './types';

/* ── payout-specific types ──────────────────────────────── */

export type PayoutMethod = 'crypto_btc' | 'crypto_eth' | 'crypto_usdt' | 'bank_wire' | 'bank_ach';

export interface PayoutMethodConfig {
  method: PayoutMethod;
  label: string;
  minimumPayout: number; // in USD
  processingDays: number;
  feePercent: number;
}

export interface ReferralEarnings {
  tenantId: string;
  totalEarned: number;
  totalPaidOut: number;
  pendingBalance: number;
  lastPayoutAt: Date | null;
  payoutMethod: PayoutMethod | null;
  payoutAddress: string | null; // wallet or bank account
}

export interface PayoutHistoryRecord {
  id: string;
  tenantId: string;
  amount: number;
  currency: string;
  method: PayoutMethod;
  status: PayoutStatus;
  commissionIds: string[];
  transactionId: string | null;
  payoutAddress: string;
  processedAt: Date | null;
  createdAt: Date;
  error: string | null;
}

export interface ProcessPayoutResult {
  success: boolean;
  payoutId: string;
  amount: number;
  method: PayoutMethod;
  transactionId?: string;
  error?: string;
}

/* ── payout method configurations ───────────────────────── */

const PAYOUT_METHODS: Record<PayoutMethod, PayoutMethodConfig> = {
  crypto_btc: { method: 'crypto_btc', label: 'Bitcoin (BTC)', minimumPayout: 25, processingDays: 1, feePercent: 0.5 },
  crypto_eth: { method: 'crypto_eth', label: 'Ethereum (ETH)', minimumPayout: 25, processingDays: 1, feePercent: 0.5 },
  crypto_usdt: { method: 'crypto_usdt', label: 'USDT (TRC-20)', minimumPayout: 10, processingDays: 1, feePercent: 0.3 },
  bank_wire: { method: 'bank_wire', label: 'Bank Wire', minimumPayout: 100, processingDays: 3, feePercent: 2.0 },
  bank_ach: { method: 'bank_ach', label: 'Bank ACH', minimumPayout: 50, processingDays: 2, feePercent: 1.0 },
};

/* ── database helpers ───────────────────────────────────── */

async function ensurePayoutTables(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS referral_earnings (
      tenant_id TEXT PRIMARY KEY,
      total_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_paid_out NUMERIC(12,2) NOT NULL DEFAULT 0,
      pending_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      last_payout_at TIMESTAMPTZ,
      payout_method TEXT,
      payout_address TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS payout_history (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      commission_ids TEXT[] NOT NULL DEFAULT '{}',
      transaction_id TEXT,
      payout_address TEXT NOT NULL,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      error TEXT
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_payout_history_tenant
    ON payout_history(tenant_id, created_at DESC)
  `);
}

/* ── payout class ───────────────────────────────────────── */

export class ReferralPayout {
  /**
   * Get or initialize earnings record for a tenant
   */
  async getEarnings(tenantId: string): Promise<ReferralEarnings> {
    await ensurePayoutTables();

    const result = await query(
      `SELECT * FROM referral_earnings WHERE tenant_id = $1`,
      [tenantId],
    );

    if (result.rows.length === 0) {
      // Initialize earnings record
      await query(
        `INSERT INTO referral_earnings (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [tenantId],
      );
      return {
        tenantId,
        totalEarned: 0,
        totalPaidOut: 0,
        pendingBalance: 0,
        lastPayoutAt: null,
        payoutMethod: null,
        payoutAddress: null,
      };
    }

    const row = result.rows[0] as Record<string, any>;
    return {
      tenantId: String(row.tenant_id),
      totalEarned: Number(row.total_earned),
      totalPaidOut: Number(row.total_paid_out),
      pendingBalance: Number(row.pending_balance),
      lastPayoutAt: row.last_payout_at as Date | null,
      payoutMethod: row.payout_method as PayoutMethod | null,
      payoutAddress: row.payout_address as string | null,
    };
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
    await ensurePayoutTables();

    const result = await query(
      `SELECT * FROM payout_history
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    );

    return result.rows.map((row: Record<string, any>) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      amount: Number(row.amount),
      currency: String(row.currency),
      method: row.method as PayoutMethod,
      status: row.status as PayoutStatus,
      commissionIds: (row.commission_ids as string[]) || [],
      transactionId: (row.transaction_id as string) || null,
      payoutAddress: String(row.payout_address),
      processedAt: row.processed_at as Date | null,
      createdAt: new Date(row.created_at),
      error: (row.error as string) || null,
    }));
  }

  /**
   * Process a payout for a tenant
   * Calculates amount, deducts fees, creates payout record, and executes transfer.
   */
  async processPayout(
    tenantId: string,
    commissionIds: string[],
  ): Promise<ProcessPayoutResult> {
    await ensurePayoutTables();

    const earnings = await this.getEarnings(tenantId);
    if (!earnings.payoutMethod || !earnings.payoutAddress) {
      return {
        success: false,
        payoutId: '',
        amount: 0,
        method: 'crypto_usdt',
        error: 'No payout method configured. Set payout method first.',
      };
    }

    const config = PAYOUT_METHODS[earnings.payoutMethod];
    if (earnings.pendingBalance < config.minimumPayout) {
      return {
        success: false,
        payoutId: '',
        amount: 0,
        method: earnings.payoutMethod,
        error: `Minimum payout is $${config.minimumPayout}. Current balance: $${earnings.pendingBalance.toFixed(2)}`,
      };
    }

    const grossAmount = earnings.pendingBalance;
    const feeAmount = grossAmount * (config.feePercent / 100);
    const netAmount = grossAmount - feeAmount;

    const payoutId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create payout history record
    await query(
      `INSERT INTO payout_history (id, tenant_id, amount, currency, method, status, commission_ids, payout_address)
       VALUES ($1, $2, $3, 'usd', $4, 'pending', $5, $6)`,
      [payoutId, tenantId, netAmount, earnings.payoutMethod, commissionIds, earnings.payoutAddress],
    );

    try {
      // Execute payout via configured method
      const transactionId = await this.executeTransfer(
        earnings.payoutMethod,
        earnings.payoutAddress,
        netAmount,
      );

      // Mark payout as completed
      await query(
        `UPDATE payout_history
         SET status = 'completed', transaction_id = $2, processed_at = NOW()
         WHERE id = $1`,
        [payoutId, transactionId],
      );

      // Update earnings balance
      await query(
        `UPDATE referral_earnings
         SET total_paid_out = total_paid_out + $2,
             pending_balance = pending_balance - $2,
             last_payout_at = NOW(),
             updated_at = NOW()
         WHERE tenant_id = $1`,
        [tenantId, grossAmount],
      );

      // Mark commissions as paid
      for (const commId of commissionIds) {
        await referralRepository.updateCommissionStatus(commId, 'paid');
      }

      logger.info('[ReferralPayout] Payout completed', {
        payoutId,
        tenantId,
        amount: netAmount,
        fee: feeAmount,
        method: earnings.payoutMethod,
        transactionId,
      });

      return {
        success: true,
        payoutId,
        amount: netAmount,
        method: earnings.payoutMethod,
        transactionId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await query(
        `UPDATE payout_history SET status = 'failed', error = $2 WHERE id = $1`,
        [payoutId, errorMsg],
      );

      logger.error('[ReferralPayout] Payout failed', {
        payoutId,
        tenantId,
        error: errorMsg,
      });

      return {
        success: false,
        payoutId,
        amount: netAmount,
        method: earnings.payoutMethod,
        error: errorMsg,
      };
    }
  }

  /**
   * Execute the actual fund transfer via the configured method.
   * In production, this calls crypto exchange APIs or banking provider.
   */
  private async executeTransfer(
    method: PayoutMethod,
    address: string,
    amount: number,
  ): Promise<string> {
    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Crypto payouts
    if (method.startsWith('crypto_')) {
      // TODO: integrate with exchange withdrawal API (Binance, OKX)
      logger.info('[ReferralPayout] Crypto transfer initiated', { method, address, amount, txId });
      return txId;
    }

    // Bank payouts
    if (method.startsWith('bank_')) {
      // TODO: integrate with banking provider (Wise, Stripe Connect)
      logger.info('[ReferralPayout] Bank transfer initiated', { method, address, amount, txId });
      return txId;
    }

    throw new Error(`Unsupported payout method: ${method}`);
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
    const config = PAYOUT_METHODS[method];
    const fee = amount * (config.feePercent / 100);
    return { fee, net: amount - fee };
  }
}

export const referralPayout = new ReferralPayout();
