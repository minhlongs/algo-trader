/**
 * Payment Service
 * Payment tracking and revenue metrics
 * Integrated with Dunning System for suspension/reinstatement
 * Provider: NOWPayments (USDT TRC20)
 */

import { AuditLogService } from '../audit/audit-log-service';
import { DunningService } from './dunning-service';
import { LicenseService } from './license-service';
import { RevenueMetricsCalculator } from './metrics/revenue-metrics';
import {
  type Payment,
  type PaymentStatus,
  type CreatePaymentInput,
  type RevenueMetrics,
} from './payment-types';
import { saveToFile } from './payment-store';
import {
  signStripeWebhook,
  verifyStripeSignature,
  generatePaymentId,
} from './payment-crypto';

export * from './payment-types';
export * from './payment-store';
export * from './payment-crypto';

export class PaymentService {
  private payments: Map<string, Payment> = new Map();
  private auditService: AuditLogService;
  private dunningService: DunningService;
  private licenseService: LicenseService;
  private static instance: PaymentService;

  constructor(_options: { nowpaymentsApiKey?: string; stripeSecretKey?: string } = {}) {
    this.auditService = AuditLogService.getInstance();
    this.dunningService = DunningService.getInstance();
    this.licenseService = LicenseService.getInstance();
    this.payments = new Map();
  }

  static getInstance(options?: { nowpaymentsApiKey?: string; stripeSecretKey?: string }): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService(options);
    }
    return PaymentService.instance;
  }

  signStripeWebhook(event: unknown, secret: string): string {
    return signStripeWebhook(event, secret);
  }

  verifyStripeSignature(event: unknown, signature: string, secret: string): boolean {
    return verifyStripeSignature(event, signature, secret);
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    const id = `pay_${this.generateId()}`;
    const now = new Date().toISOString();

    const payment: Payment = {
      id, providerPaymentId: input.providerPaymentId,
      subscriptionId: input.subscriptionId, customerEmail: input.customerEmail,
      amount: input.amount, currency: input.currency, status: input.status,
      productId: input.productId, createdAt: now, updatedAt: now, metadata: input.metadata,
    };

    this.payments.set(id, payment);
    saveToFile(this.payments);
    return payment;
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    return this.payments.get(id);
  }

  async getPaymentByProviderId(providerId: string): Promise<Payment | undefined> {
    for (const payment of this.payments.values()) {
      if (payment.providerPaymentId === providerId) return payment;
    }
    return undefined;
  }

  async getPaymentsByCustomer(customerEmail: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter((p) => p.customerEmail === customerEmail);
  }

  async updatePaymentStatus(id: string, status: PaymentStatus): Promise<Payment | undefined> {
    const payment = this.payments.get(id);
    if (!payment) return undefined;

    payment.status = status;
    payment.updatedAt = new Date().toISOString();
    this.payments.set(id, payment);
    saveToFile(this.payments);
    return payment;
  }

  async recordPaymentSuccess(
    providerPaymentId: string, customerEmail: string,
    amount: number, currency: string, subscriptionId?: string,
  ): Promise<Payment> {
    const payment = await this.createPayment({
      providerPaymentId, customerEmail, amount, currency, status: 'success', subscriptionId,
    });
    await this.handlePaymentResult(payment, subscriptionId, customerEmail, 'success');
    return payment;
  }

  async recordPaymentFailed(
    providerPaymentId: string, customerEmail: string,
    amount: number, currency: string, subscriptionId?: string,
  ): Promise<Payment> {
    const payment = await this.createPayment({
      providerPaymentId, customerEmail, amount, currency, status: 'failed', subscriptionId,
    });
    await this.handlePaymentResult(payment, subscriptionId, customerEmail, 'failed');
    return payment;
  }

  private async handlePaymentResult(
    payment: Payment, subscriptionId: string | undefined,
    customerEmail: string, status: 'success' | 'failed',
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
        amount: payment.amount, currency: payment.currency,
      },
    });
  }

  async getAllPayments(): Promise<Payment[]> {
    return Array.from(this.payments.values());
  }

  async getRevenueMetrics(): Promise<RevenueMetrics> {
    return RevenueMetricsCalculator.calculate(Array.from(this.payments.values()));
  }

  private generateId(): string {
    return generatePaymentId();
  }
}
