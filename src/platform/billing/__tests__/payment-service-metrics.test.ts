/**
 * Payment Service Tests - Revenue Metrics & Analytics
 */
import { describe, it, expect, beforeEach } from 'vitest';

process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64);

import { setupPgMock, resetStore } from './payment-service.fixtures';
setupPgMock();

import { PaymentService } from '../payment-service';
import { LicenseService } from '../license-service';
import { DunningService } from '../dunning-service';

describe('PaymentService - Revenue Metrics', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = PaymentService.getInstance();
    LicenseService.getInstance();
    DunningService.getInstance();
    resetStore();
    (service as any).payments.clear();
  });

  async function seedPayment(providerId: string, email: string, amount: number, status: 'success' | 'failed' | 'pending') {
    return service.createPayment({ providerPaymentId: providerId, customerEmail: email, amount, currency: 'USD', status });
  }

  it('should calculate total revenue from successful payments', async () => {
    await seedPayment('np_pay_1', 'test1@example.com', 100, 'success');
    await seedPayment('np_pay_2', 'test2@example.com', 200, 'success');
    expect((await service.getRevenueMetrics()).totalRevenue).toBe(300);
  });

  it('should exclude failed payments from revenue', async () => {
    await seedPayment('np_pay_1', 'test1@example.com', 100, 'success');
    await seedPayment('np_pay_2', 'test2@example.com', 200, 'failed');
    expect((await service.getRevenueMetrics()).totalRevenue).toBe(100);
  });

  it('should calculate payment success rate', async () => {
    await seedPayment('np_pay_1', 'test1@example.com', 100, 'success');
    await seedPayment('np_pay_2', 'test2@example.com', 100, 'success');
    await seedPayment('np_pay_3', 'test3@example.com', 100, 'failed');
    expect((await service.getRevenueMetrics()).paymentSuccessRate).toBeCloseTo(2 / 3, 2);
  });

  it('should return zero success rate when no payments', async () => {
    expect((await service.getRevenueMetrics()).paymentSuccessRate).toBe(0);
  });

  it('should calculate payment status distribution', async () => {
    await seedPayment('np_pay_1', 'test1@example.com', 100, 'success');
    await seedPayment('np_pay_2', 'test2@example.com', 100, 'failed');
    await seedPayment('np_pay_3', 'test3@example.com', 100, 'pending');
    const metrics = await service.getRevenueMetrics();
    expect(metrics.paymentStatusDistribution.success).toBe(1);
    expect(metrics.paymentStatusDistribution.failed).toBe(1);
    expect(metrics.paymentStatusDistribution.pending).toBe(1);
    expect(metrics.paymentStatusDistribution.refunded).toBe(0);
  });

  it('should calculate avg license value', async () => {
    await seedPayment('np_pay_1', 'unique1@example.com', 100, 'success');
    await seedPayment('np_pay_2', 'unique2@example.com', 200, 'success');
    expect((await service.getRevenueMetrics()).avgLicenseValue).toBe(150);
  });
});
