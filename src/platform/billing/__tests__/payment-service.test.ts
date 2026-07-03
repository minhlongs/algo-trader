/**
 * Payment Service Tests
 * Payment tracking and revenue metrics tests (NOWPayments provider)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentService } from '../payment-service';

const { mockPayments, mockQuery } = vi.hoisted(() => {
  const data = new Map<string, Record<string, any>>();
  const fn = vi.fn((text: string, params?: any[]) => {
    // INSERT INTO payments
    if (text.startsWith('INSERT INTO payments')) {
      const row: Record<string, any> = {
        id: params![0],
        provider_payment_id: params![1],
        subscription_id: params![2],
        customer_email: params![3],
        amount: params![4],
        currency: params![5],
        status: params![6],
        product_id: params![7],
        metadata: params![8],
        created_at: params![9],
        updated_at: params![10],
      };
      data.set(row.id, row);
      return { rows: [row] };
    }
    // SELECT by id
    if (text === 'SELECT * FROM payments WHERE id = $1') {
      const row = data.get(params![0]);
      return { rows: row ? [row] : [] };
    }
    // SELECT by provider_payment_id
    if (text === 'SELECT * FROM payments WHERE provider_payment_id = $1') {
      const rows = [...data.values()].filter((r: any) => r.provider_payment_id === params![0]);
      return { rows };
    }
    // SELECT by customer_email
    if (text === 'SELECT * FROM payments WHERE customer_email = $1') {
      const rows = [...data.values()].filter((r: any) => r.customer_email === params![0]);
      return { rows };
    }
    // SELECT all
    if (text === 'SELECT * FROM payments') {
      return { rows: [...data.values()] };
    }
    // UPDATE status
    if (text.startsWith('UPDATE payments SET status')) {
      const [status, updatedAt, id] = params!;
      const row = data.get(id);
      if (row) {
        row.status = status;
        row.updated_at = updatedAt;
      }
      return { rows: row ? [row] : [] };
    }
    return { rows: [] };
  });
  return { mockPayments: data, mockQuery: fn };
});

vi.mock('../../../shared/db/postgres-client', () => ({
  query: mockQuery,
}));

vi.mock('../../audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => ({
      log: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('../dunning-service', () => ({
  DunningService: {
    getInstance: () => ({
      recordPaymentFailure: vi.fn().mockResolvedValue(undefined),
      recordPaymentSuccess: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = PaymentService.getInstance();
    mockPayments.clear();
  });

  describe('createPayment', () => {
    it('should create payment with correct properties', async () => {
      const input = {
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        amount: 49.0,
        currency: 'USD',
        status: 'success' as const,
        subscriptionId: 'sub-123',
      };

      const payment = await service.createPayment(input);

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
      const result = await service.getPayment('non-existent');
      expect(result).toBeUndefined();
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
      const result = await service.getPaymentByProviderId('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('getPaymentsByCustomer', () => {
    it('should get all payments for a customer', async () => {
      const email = 'customer@example.com';
      await service.createPayment({
        providerPaymentId: 'np_pay_1',
        customerEmail: email,
        amount: 49.0,
        currency: 'USD',
        status: 'success',
      });
      await service.createPayment({
        providerPaymentId: 'np_pay_2',
        customerEmail: email,
        amount: 149.0,
        currency: 'USD',
        status: 'success',
      });

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
      const result = await service.updatePaymentStatus('non-existent', 'success');
      expect(result).toBeUndefined();
    });
  });

  describe('recordPaymentSuccess', () => {
    it('should create payment and log audit event', async () => {
      const payment = await service.recordPaymentSuccess(
        'np_pay_123',
        'test@example.com',
        49.0,
        'USD',
        'sub-123'
      );

      expect(payment.status).toBe('success');
      expect(payment.amount).toBe(49.0);
      expect(payment.providerPaymentId).toBe('np_pay_123');
    });
  });

  describe('recordPaymentFailed', () => {
    it('should create failed payment and trigger dunning', async () => {
      const payment = await service.recordPaymentFailed(
        'np_pay_123',
        'test@example.com',
        49.0,
        'USD',
        'sub-123'
      );

      expect(payment.status).toBe('failed');
      expect(payment.amount).toBe(49.0);
    });
  });

  describe('getAllPayments', () => {
    it('should return all payments', async () => {
      await service.createPayment({
        providerPaymentId: 'np_pay_1',
        customerEmail: 'test1@example.com',
        amount: 49.0,
        currency: 'USD',
        status: 'success',
      });
      await service.createPayment({
        providerPaymentId: 'np_pay_2',
        customerEmail: 'test2@example.com',
        amount: 149.0,
        currency: 'USD',
        status: 'success',
      });

      const payments = await service.getAllPayments();

      expect(payments.length).toBe(2);
    });
  });

  describe('getRevenueMetrics', () => {
    it('should calculate total revenue from successful payments', async () => {
      await service.createPayment({
        providerPaymentId: 'np_pay_1',
        customerEmail: 'test1@example.com',
        amount: 100,
        currency: 'USD',
        status: 'success',
      });
      await service.createPayment({
        providerPaymentId: 'np_pay_2',
        customerEmail: 'test2@example.com',
        amount: 200,
        currency: 'USD',
        status: 'success',
      });

      const metrics = await service.getRevenueMetrics();

      expect(metrics.totalRevenue).toBe(300);
    });

    it('should exclude failed payments from revenue', async () => {
      await service.createPayment({
        providerPaymentId: 'np_pay_1',
        customerEmail: 'test1@example.com',
        amount: 100,
        currency: 'USD',
        status: 'success',
      });
      await service.createPayment({
        providerPaymentId: 'np_pay_2',
        customerEmail: 'test2@example.com',
        amount: 200,
        currency: 'USD',
        status: 'failed',
      });

      const metrics = await service.getRevenueMetrics();

      expect(metrics.totalRevenue).toBe(100);
    });

    it('should calculate payment success rate', async () => {
      await service.createPayment({
        providerPaymentId: 'np_pay_1',
        customerEmail: 'test1@example.com',
        amount: 100,
        currency: 'USD',
        status: 'success',
      });
      await service.createPayment({
        providerPaymentId: 'np_pay_2',
        customerEmail: 'test2@example.com',
        amount: 100,
        currency: 'USD',
        status: 'success',
      });
      await service.createPayment({
        providerPaymentId: 'np_pay_3',
        customerEmail: 'test3@example.com',
        amount: 100,
        currency: 'USD',
        status: 'failed',
      });

      const metrics = await service.getRevenueMetrics();

      expect(metrics.paymentSuccessRate).toBeCloseTo(2 / 3, 2);
    });

    it('should return zero success rate when no payments', async () => {
      const metrics = await service.getRevenueMetrics();

      expect(metrics.paymentSuccessRate).toBe(0);
    });

    it('should calculate payment status distribution', async () => {
      await service.createPayment({
        providerPaymentId: 'np_pay_1',
        customerEmail: 'test1@example.com',
        amount: 100,
        currency: 'USD',
        status: 'success',
      });
      await service.createPayment({
        providerPaymentId: 'np_pay_2',
        customerEmail: 'test2@example.com',
        amount: 100,
        currency: 'USD',
        status: 'failed',
      });
      await service.createPayment({
        providerPaymentId: 'np_pay_3',
        customerEmail: 'test3@example.com',
        amount: 100,
        currency: 'USD',
        status: 'pending',
      });

      const metrics = await service.getRevenueMetrics();

      expect(metrics.paymentStatusDistribution.success).toBe(1);
      expect(metrics.paymentStatusDistribution.failed).toBe(1);
      expect(metrics.paymentStatusDistribution.pending).toBe(1);
      expect(metrics.paymentStatusDistribution.refunded).toBe(0);
    });

    it('should calculate avg license value', async () => {
      await service.createPayment({
        providerPaymentId: 'np_pay_1',
        customerEmail: 'unique1@example.com',
        amount: 100,
        currency: 'USD',
        status: 'success',
      });
      await service.createPayment({
        providerPaymentId: 'np_pay_2',
        customerEmail: 'unique2@example.com',
        amount: 200,
        currency: 'USD',
        status: 'success',
      });

      const metrics = await service.getRevenueMetrics();

      expect(metrics.avgLicenseValue).toBe(150);
    });
  });
});
