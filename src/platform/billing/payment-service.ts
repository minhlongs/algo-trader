/**
 * Payment Service
 * Payment tracking and revenue metrics
 * Integrated with Dunning System for suspension/reinstatement
 * Provider: NOWPayments (USDT TRC20)
 * Storage: PostgreSQL via postgres-client
 */

import { query } from '../../shared/db/postgres-client';
import { AuditLogService } from '../audit/audit-log-service';
import { DunningService } from './dunning-service';
import { LicenseService } from './license-service';
import { RevenueMetricsCalculator } from './metrics/revenue-metrics';

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

function rowToPayment(row: any): Payment {
  return {
    id: row.id,
    providerPaymentId: row.provider_payment_id,
    subscriptionId: row.subscription_id ?? undefined,
    customerEmail: row.customer_email,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as PaymentStatus,
    productId: row.product_id ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    metadata: row.metadata ?? undefined,
  };
}

export class PaymentService {
  private static instance: PaymentService;
  private auditService: AuditLogService;
  private dunningService: DunningService;
  private licenseService: LicenseService;

  private constructor() {
    this.auditService = AuditLogService.getInstance();
    this.dunningService = DunningService.getInstance();
    this.licenseService = LicenseService.getInstance();
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) PaymentService.instance = new PaymentService();
    return PaymentService.instance;
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    const id = `pay_${this.generateId()}`;
    const now = new Date().toISOString();

    const result = await query(
      `INSERT INTO payments (id, provider_payment_id, subscription_id, customer_email, amount, currency, status, product_id, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        input.providerPaymentId,
        input.subscriptionId ?? null,
        input.customerEmail,
        input.amount,
        input.currency,
        input.status,
        input.productId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        now,
        now,
      ]
    );

    return rowToPayment(result.rows[0]);
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const result = await query('SELECT * FROM payments WHERE id = $1', [id]);
    if (result.rows.length === 0) return undefined;
    return rowToPayment(result.rows[0]);
  }

  async getPaymentByProviderId(providerId: string): Promise<Payment | undefined> {
    const result = await query('SELECT * FROM payments WHERE provider_payment_id = $1', [providerId]);
    if (result.rows.length === 0) return undefined;
    return rowToPayment(result.rows[0]);
  }

  async getPaymentsByCustomer(customerEmail: string): Promise<Payment[]> {
    const result = await query('SELECT * FROM payments WHERE customer_email = $1', [customerEmail]);
    return result.rows.map(rowToPayment);
  }

  async updatePaymentStatus(id: string, status: PaymentStatus): Promise<Payment | undefined> {
    const now = new Date().toISOString();
    const result = await query(
      'UPDATE payments SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *',
      [status, now, id]
    );
    if (result.rows.length === 0) return undefined;
    return rowToPayment(result.rows[0]);
  }

  async recordPaymentSuccess(
    providerPaymentId: string,
    customerEmail: string,
    amount: number,
    currency: string,
    subscriptionId?: string
  ): Promise<Payment> {
    const payment = await this.createPayment({
      providerPaymentId,
      customerEmail,
      amount,
      currency,
      status: 'success',
      subscriptionId,
    });

    await this.handlePaymentResult(payment, subscriptionId, customerEmail, 'success');
    return payment;
  }

  async recordPaymentFailed(
    providerPaymentId: string,
    customerEmail: string,
    amount: number,
    currency: string,
    subscriptionId?: string
  ): Promise<Payment> {
    const payment = await this.createPayment({
      providerPaymentId,
      customerEmail,
      amount,
      currency,
      status: 'failed',
      subscriptionId,
    });

    await this.handlePaymentResult(payment, subscriptionId, customerEmail, 'failed');
    return payment;
  }

  private async handlePaymentResult(
    payment: Payment,
    subscriptionId: string | undefined,
    customerEmail: string,
    status: 'success' | 'failed'
  ): Promise<void> {
    if (subscriptionId) {
      const license = await this.licenseService.getLicenseBySubscription(subscriptionId);
      if (license) {
        const dunning = this.dunningService;
        if (status === 'success') {
          await dunning.recordPaymentSuccess(license.id, customerEmail, subscriptionId);
        } else {
          await dunning.recordPaymentFailure(license.id, customerEmail, subscriptionId);
        }
      }
    }

    await this.auditService.log(subscriptionId || customerEmail, 'created', {
      metadata: {
        eventType: status === 'success' ? 'payment_success' : 'payment_failed',
        amount: payment.amount,
        currency: payment.currency,
      },
    });
  }

  async getAllPayments(): Promise<Payment[]> {
    const result = await query('SELECT * FROM payments');
    return result.rows.map(rowToPayment);
  }

  async getRevenueMetrics(): Promise<RevenueMetrics> {
    const result = await query('SELECT * FROM payments');
    const payments = result.rows.map(rowToPayment);
    return RevenueMetricsCalculator.calculate(payments);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
