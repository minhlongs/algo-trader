/**
 * Referral Payout — pure fee/net-amount calculators.
 *
 * Extracted from referral-payout.ts. No side effects; used by both the
 * processPayout flow and the public calculateFee method.
 */

import { PAYOUT_METHODS } from './referral-payout-types';
import type { PayoutMethod } from './referral-payout-types';

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
