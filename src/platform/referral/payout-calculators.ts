/**
 * Referral Payout — pure fee/net-amount calculators and validation helpers.
 *
 * Extracted from referral-payout.ts. No side effects; used by both the
 * processPayout flow and the public calculateFee method.
 */

import { PAYOUT_METHODS } from './referral-payout-types';
import type { PayoutMethod, ProcessPayoutResult, ReferralEarnings } from './referral-payout-types';

/** Fee + net amount for a gross payout amount under a method's fee schedule. */
export function calculatePayoutFee(
  amount: number,
  method: PayoutMethod,
): { fee: number; net: number } {
  const config = PAYOUT_METHODS[method];
  const fee = amount * (config.feePercent / 100);
  return { fee, net: amount - fee };
}

/** Generate a unique payout record id. */
export function generatePayoutId(): string {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a unique transfer transaction id. */
export function generateTransactionId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validate whether a tenant's earnings record is eligible for payout.
 * Returns a failure ProcessPayoutResult if ineligible, or null if valid.
 */
export function validatePayoutEligibility(
  earnings: Pick<ReferralEarnings, 'payoutMethod' | 'payoutAddress' | 'pendingBalance'>,
): ProcessPayoutResult | null {
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

  return null;
}
