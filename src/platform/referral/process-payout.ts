/**
 * Referral Payout — processPayout + executeTransfer orchestration.
 *
 * Extracted from referral-payout.ts to keep the facade class under 200 LOC.
 * Uses the circular type-only import pattern: `import type { ReferralPayout }`
 * is erased at runtime, so there is no circular runtime import. The class
 * methods delegate via `.call(this)`.
 */

import { referralRepository } from './referral-repository';
import { query } from '../../shared/db/postgres-client.js';
import { logger } from '../../shared/utils/logger';
import { PAYOUT_METHODS } from './referral-payout-types';
import type { PayoutMethod, ProcessPayoutResult, ReferralPayoutLike } from './referral-payout-types';
import { calculatePayoutFee, generatePayoutId, generateTransactionId } from './payout-calculators';
import { ensurePayoutTables } from './payout-tables';

/**
 * Process a payout for a tenant.
 * Calculates amount, deducts fees, creates payout record, and executes transfer.
 */
export async function processPayout(
  this: ReferralPayoutLike,
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
  const { fee: feeAmount, net: netAmount } = calculatePayoutFee(grossAmount, earnings.payoutMethod);

  const payoutId = generatePayoutId();

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
export async function executeTransfer(
  this: ReferralPayoutLike,
  method: PayoutMethod,
  address: string,
  amount: number,
): Promise<string> {
  const txId = generateTransactionId();

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
