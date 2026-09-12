/**
 * Payment Service Types
 */

export interface Payment {
  id: string;
  providerPaymentId: string;
  subscriptionId?: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  productId?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';

export interface CreatePaymentInput {
  providerPaymentId: string;
  subscriptionId?: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  productId?: string;
  metadata?: Record<string, unknown>;
}

export interface RevenueMetrics {
  mrr: number;
  totalRevenue: number;
  avgLicenseValue: number;
  paymentSuccessRate: number;
  paymentStatusDistribution: PaymentStatusDistribution;
}

export interface PaymentStatusDistribution {
  success: number;
  failed: number;
  pending: number;
  refunded: number;
}
