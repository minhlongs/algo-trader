/**
 * Subscription Types and Interfaces
 */

import { LicenseTier } from '../../shared/types/license';

export interface Subscription {
  id: string;
  providerPaymentId: string;
  customerEmail: string;
  productId: string;
  status: SubscriptionStatus;
  tier: LicenseTier;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  amount?: number;
  currency?: string;
  licenseId?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  userId?: string;
}

export type SubscriptionStatus = 'pending' | 'active' | 'cancelled' | 'expired';

export interface CreateSubscriptionInput {
  providerPaymentId: string;
  customerEmail: string;
  productId: string;
  status: SubscriptionStatus;
  tier: LicenseTier;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  amount?: number;
  currency?: string;
}
