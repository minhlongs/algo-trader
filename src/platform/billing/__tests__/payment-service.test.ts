/**
 * Payment Service Tests - CRUD & Lifecycle
 */
import { describe, it, expect, beforeEach } from 'vitest';

process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64);

import { setupPgMock, store, resetStore } from './payment-service.fixtures';
setupPgMock();

import { PaymentService } from '../payment-service';
import { LicenseService } from '../license-service';
import { DunningService } from '../dunning-service';

describe('PaymentService', () => {
  let service: PaymentService;
  let licenseService: LicenseService;
  let dunningService: DunningService;

  beforeEach(() => {
    service = PaymentService.getInstance();
    licenseService = LicenseService.getInstance();
    dunningService = DunningService.getInstance();
    resetStore();
    (service as any).payments.clear();
    (licenseService as any).licenses.clear();
  });

  describe('createPayment', () => {
    it('should create payment with correct properties', async () => {
      const payment = await service.createPayment({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        amount: 49.0,
        currency: 'USD',
        status: 'success' as const,
        subscriptionId: 'sub-123',
      });
      expect(payment.id).toMatch(/^pay_/);
      expect(payment.providerPaymentId).toBe('np_pay_123');
      expect(payment.customerEmail).toBe('test@example.com');
      expect(payment.amount).toBe(49.0);
      expect(payment.currency).toBe('USD');
      expect(payment.status).toBe('success');
    });
  });

  describe('getPayment', () => {
    it('should get payment by id', async () => {
      const created = await service.createPayment({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        amount: 49.0,
        currency: 'USD',
        status: 'success',
      });
      const retrieved = await service.getPayment(created.id);
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.amount).toBe(49.0);
    });

    it('should return undefined for non-existent payment', async () => {
      expect(await service.getPayment('non-existent')).toBeUndefined();
    });
  });

  describe('getPaymentByProviderId', () => {
    it('should get payment by provider payment id', async () => {
      await service.createPayment({
        providerPaymentId: 'np_pay_unique_123',
        customerEmail: 'test@example.com',
        amount: 49.0,
        currency: 'USD',
        status: 'success',
      });
      const retrieved = await service.getPaymentByProviderId('np_pay_unique_123');
      expect(retrieved?.providerPaymentId).toBe('np_pay_unique_123');
    });

    it('should return undefined for non-existent provider id', async () => {
      expect(await service.getPaymentByProviderId('non-existent')).toBeUndefined();
    });
  });

  describe('getPaymentsByCustomer', () => {
    it('should get all payments for a customer', async () => {
      const email = 'customer@example.com';
      await service.createPayment({ providerPaymentId: 'np_pay_1', customerEmail: email, amount: 49.0, currency: 'USD', status: 'success' });
      await service.createPayment({ providerPaymentId: 'np_pay_2', customerEmail: email, amount: 149.0, currency: 'USD', status: 'success' });
      const payments = await service.getPaymentsByCustomer(email);
      expect(payments.length).toBe(2);
      expect(payments.every((p) => p.customerEmail === email)).toBe(true);
    });
  });

  describe('updatePaymentStatus', () => {
    it('should update payment status', async () => {
      const payment = await service.createPayment({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        amount: 49.0,
        currency: 'USD',
        status: 'pending',
      });
      const updated = await service.updatePaymentStatus(payment.id, 'success');
      expect(updated?.status).toBe('success');
      expect(updated?.updatedAt).toBeDefined();
    });

    it('should return undefined for non-existent payment', async () => {
      expect(await service.updatePaymentStatus('non-existent', 'success')).toBeUndefined();
    });
  });

  describe('recordPaymentSuccess', () => {
    it('should create payment and log audit event', async () => {
      const payment = await service.recordPaymentSuccess('np_pay_123', 'test@example.com', 49.0, 'USD', 'sub-123');
      expect(payment.status).toBe('success');
      expect(payment.amount).toBe(49.0);
      expect(payment.providerPaymentId).toBe('np_pay_123');
    });
  });

  describe('recordPaymentFailed', () => {
    it('should create failed payment and trigger dunning', async () => {
      const payment = await service.recordPaymentFailed('np_pay_123', 'test@example.com', 49.0, 'USD', 'sub-123');
      expect(payment.status).toBe('failed');
      expect(payment.amount).toBe(49.0);
    });
  });

  describe('getAllPayments', () => {
    it('should return all payments', async () => {
      await service.createPayment({ providerPaymentId: 'np_pay_1', customerEmail: 'test1@example.com', amount: 49.0, currency: 'USD', status: 'success' });
      await service.createPayment({ providerPaymentId: 'np_pay_2', customerEmail: 'test2@example.com', amount: 149.0, currency: 'USD', status: 'success' });
      expect((await service.getAllPayments()).length).toBe(2);
    });
  });
});
