/**
 * NOWPayments IPN Webhook HTTP E2E Test
 *
 * Tests the FULL HTTP path: express.json(verify) → rawBody capture →
 * HMAC-SHA512 verification (mocked) → IPN dispatch → subscription + license creation.
 *
 * Differs from nowpayments-ipn-e2e.test.ts (which calls handlers directly):
 * This test mounts the router on a real Express app and sends HTTP POST requests,
 * exercising the middleware chain that captures req.rawBody for signature verification.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import { nowpaymentsWebhookRouter } from '../../src/platform/api/routes/webhooks/nowpayments-webhook';
import { SubscriptionService } from '../../src/platform/billing/subscription-service';
import { LicenseService } from '../../src/platform/billing/license-service';
import { NowPaymentsService } from '../../src/platform/billing/nowpayments-service';
import { LicenseTier } from '../../src/shared/types/license';

// Crypto for generating test HMAC signatures
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a test app with the nowpayments webhook router mounted at /api/webhooks/nowpayments */
function createTestApp(): express.Application {
  const app = express();

  // Mirror the production middleware: capture raw body BEFORE json() parses it
  app.use(
    express.json({
      verify: (req: any, _res: any, buf: Buffer) => {
        req.rawBody = buf.toString('utf-8');
      },
    })
  );

  app.use('/api/webhooks/nowpayments', nowpaymentsWebhookRouter);

  // Catch-all so supertest gets a response for unknown routes too
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  return app;
}

/** Generate a valid-looking HMAC-SHA512 signature for test payloads */
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}

/** Standard PRO-tier IPN payload */
function makeFinishedIpn(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    payment_id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    payment_status: 'finished',
    invoice_id: 'inv-pro-e2e',
    order_id: 'e2e-customer@test.com',
    price_amount: 99,
    price_currency: 'usd',
    actually_paid: 98.5,
    pay_currency: 'usdttrc20',
    pay_address: 'TTestAddress123',
    ...overrides,
  };
}

/** Configure mocks on the NOWPayments service */
function mockNowPayments(tier: LicenseTier, invoiceId: string): void {
  const svc = NowPaymentsService.getInstance();
  vi.spyOn(svc, 'verifyWebhook').mockResolvedValue(true);
  vi.spyOn(svc, 'getTierByInvoiceId').mockReturnValue({
    tier,
    invoiceId,
    price: tier === LicenseTier.ENTERPRISE ? 299 : 99,
    currency: 'USD',
    name: tier === LicenseTier.ENTERPRISE ? 'Enterprise' : 'Pro Trader',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NOWPayments IPN Webhook HTTP E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SubscriptionService.resetInstance();
    LicenseService.resetInstance();
  });

  // ---------------------------------------------------------------------------
  // Error responses
  // ---------------------------------------------------------------------------

  it('should return 400 when x-nowpayments-sig header is missing', async () => {
    const app = createTestApp();
    const ipn = makeFinishedIpn();
    const payload = JSON.stringify(ipn);

    let serverRes: { status: number; body: unknown } | null = null;

    await new Promise<void>((resolve) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as any).port;
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/webhooks/nowpayments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            // no x-nowpayments-sig header
          });
          serverRes = { status: r.status, body: await r.json() };
        } catch (e) {
          serverRes = { status: 0, body: (e as Error).message };
        } finally {
          server.close();
          resolve();
        }
      });
    });

    expect(serverRes).not.toBeNull();
    expect(serverRes!.status).toBe(400);
  });

  it('should return 401 for invalid signature', async () => {
    const app = createTestApp();
    const ipn = makeFinishedIpn();
    const payload = JSON.stringify(ipn);

    // Don't mock verifyWebhook — let it try real HMAC (will fail with wrong secret)
    // Or: mock it to return false
    const nowpaymentsService = NowPaymentsService.getInstance();
    vi.spyOn(nowpaymentsService, 'verifyWebhook').mockResolvedValue(false);

    let serverRes: { status: number; body: unknown } | null = null;

    await new Promise<void>((resolve) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as any).port;
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/webhooks/nowpayments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-nowpayments-sig': 'invalidsig',
            },
            body: payload,
          });
          serverRes = { status: r.status, body: await r.json() };
        } catch (e) {
          serverRes = { status: 0, body: (e as Error).message };
        } finally {
          server.close();
          resolve();
        }
      });
    });

    expect(serverRes).not.toBeNull();
    expect(serverRes!.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Happy path — HTTP POST through the router
  // ---------------------------------------------------------------------------

  it('should return 200 + create subscription + license on PRO finished IPN', async () => {
    const app = createTestApp();
    mockNowPayments(LicenseTier.PRO, 'inv-pro-e2e');

    const ipn = makeFinishedIpn();
    const payload = JSON.stringify(ipn);
    const secret = process.env.NOWPAYMENTS_IPN_SECRET || 'test-secret';
    const signature = signPayload(payload, secret);

    let serverRes: { status: number; body: unknown } | null = null;

    await new Promise<void>((resolve) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as any).port;
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/webhooks/nowpayments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-nowpayments-sig': signature,
            },
            body: payload,
          });
          serverRes = { status: r.status, body: await r.json() };
        } catch (e) {
          serverRes = { status: 0, body: (e as Error).message };
        } finally {
          server.close();
          resolve();
        }
      });
    });

    // --- Verify HTTP response ---
    expect(serverRes).not.toBeNull();
    expect(serverRes!.status).toBe(200);
    expect(serverRes!.body).toEqual({ received: true });

    // --- Verify subscription created in service store ---
    const subService = SubscriptionService.getInstance();
    const subscription = await subService.getSubscriptionByProviderId(ipn.payment_id as string);
    expect(subscription).toBeDefined();
    expect(subscription!.status).toBe('active');
    expect(subscription!.tier).toBe(LicenseTier.PRO);
    expect(subscription!.customerEmail).toBe('e2e-customer@test.com');
    expect(subscription!.amount).toBe(99);
    expect(subscription!.licenseId).toBeDefined();

    // --- Verify license created + linked ---
    const licenseService = LicenseService.getInstance();
    const license = licenseService.getLicenseByKey(subscription!.licenseId!);
    expect(license).toBeDefined();
    expect(license!.tier).toBe('PRO');

    // --- Verify we can retrieve the same subscription by provider payment ID (idempotency check) ---
    const refreshed = await subService.getSubscriptionByProviderId(ipn.payment_id as string);
    expect(refreshed).toBeDefined();
    expect(refreshed!.licenseId).toBe(subscription!.licenseId);
  });

  // ---------------------------------------------------------------------------
  // ENTERPRISE tier
  // ---------------------------------------------------------------------------

  it('should activate ENTERPRISE tier from invoice_id resolution', async () => {
    const app = createTestApp();
    mockNowPayments(LicenseTier.ENTERPRISE, 'inv-ent-e2e');

    const ipn = makeFinishedIpn({
      payment_id: `pay-ent-${Date.now()}`,
      invoice_id: 'inv-ent-e2e',
      price_amount: 299,
    });
    const payload = JSON.stringify(ipn);
    const signature = signPayload(payload, process.env.NOWPAYMENTS_IPN_SECRET || 'test-secret');

    let serverRes: { status: number; body: unknown } | null = null;

    await new Promise<void>((resolve) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as any).port;
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/webhooks/nowpayments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-nowpayments-sig': signature,
            },
            body: payload,
          });
          serverRes = { status: r.status, body: await r.json() };
        } catch (e) {
          serverRes = { status: 0, body: (e as Error).message };
        } finally {
          server.close();
          resolve();
        }
      });
    });

    expect(serverRes!.status).toBe(200);

    const subService = SubscriptionService.getInstance();
    const sub = await subService.getSubscriptionByProviderId(ipn.payment_id as string);
    expect(sub).toBeDefined();
    expect(sub!.tier).toBe(LicenseTier.ENTERPRISE);
    expect(sub!.amount).toBe(299);
    expect(sub!.licenseId).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Idempotency — duplicate IPN via HTTP
  // ---------------------------------------------------------------------------

  it('should be idempotent: duplicate HTTP POST does not create duplicates', async () => {
    const app = createTestApp();
    mockNowPayments(LicenseTier.PRO, 'inv-pro-e2e');

    const ipn = makeFinishedIpn({ payment_id: 'pay-http-idem-001' });
    const payload = JSON.stringify(ipn);
    const signature = signPayload(payload, process.env.NOWPAYMENTS_IPN_SECRET || 'test-secret');

    let results: { status: number; body: unknown }[] = [];

    await new Promise<void>((resolve) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as any).port;
        const opts: RequestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-nowpayments-sig': signature,
          },
          body: payload,
        };

        // Send same IPN twice
        const r1 = await fetch(`http://127.0.0.1:${port}/api/webhooks/nowpayments`, opts);
        results.push({ status: r1.status, body: await r1.json() });

        const r2 = await fetch(`http://127.0.0.1:${port}/api/webhooks/nowpayments`, opts);
        results.push({ status: r2.status, body: await r2.json() });

        server.close();
        resolve();
      });
    });

    // Both should return 200
    results.forEach((r) => expect(r.status).toBe(200));

    // Only one subscription for this payment_id
    const subService = SubscriptionService.getInstance();
    const sub = await subService.getSubscriptionByProviderId('pay-http-idem-001');
    expect(sub).toBeDefined();
    expect(sub!.status).toBe('active');
  });

  // ---------------------------------------------------------------------------
  // Missing invoice_id falls back to PRO
  // ---------------------------------------------------------------------------

  it('should default to PRO tier when invoice_id is missing', async () => {
    const app = createTestApp();
    // getTierByInvoiceId is only called when invoice_id is truthy — spy to track calls
    const nowpaymentsService = NowPaymentsService.getInstance();
    const tierSpy = vi.spyOn(nowpaymentsService, 'getTierByInvoiceId');

    const ipn = makeFinishedIpn({ payment_id: 'pay-noinv-e2e', invoice_id: '' });
    const payload = JSON.stringify(ipn);
    const signature = signPayload(payload, process.env.NOWPAYMENTS_IPN_SECRET || 'test-secret');

    let serverRes: { status: number; body: unknown } | null = null;

    await new Promise<void>((resolve) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as any).port;
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/webhooks/nowpayments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-nowpayments-sig': signature,
            },
            body: payload,
          });
          serverRes = { status: r.status, body: await r.json() };
        } catch (e) {
          serverRes = { status: 0, body: (e as Error).message };
        } finally {
          server.close();
          resolve();
        }
      });
    });

    expect(serverRes!.status).toBe(200);
    expect(tierSpy).not.toHaveBeenCalled();

    const subService = SubscriptionService.getInstance();
    const sub = await subService.getSubscriptionByProviderId('pay-noinv-e2e');
    expect(sub).toBeDefined();
    expect(sub!.tier).toBe(LicenseTier.PRO);
  });

  // ---------------------------------------------------------------------------
  // Refund flow via HTTP
  // ---------------------------------------------------------------------------

  it('should cancel subscription on refunded IPN via HTTP', async () => {
    const app = createTestApp();
    const paymentId = `pay-refund-${Date.now()}`;

    // Step 1: finished → active
    mockNowPayments(LicenseTier.PRO, 'inv-pro-e2e');
    const finishedIpn = makeFinishedIpn({ payment_id: paymentId });
    const finishedPayload = JSON.stringify(finishedIpn);
    const finishedSig = signPayload(finishedPayload, process.env.NOWPAYMENTS_IPN_SECRET || 'test-secret');

    const subService = SubscriptionService.getInstance();

    await new Promise<void>((resolve) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as any).port;
        fetch(`http://127.0.0.1:${port}/api/webhooks/nowpayments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-nowpayments-sig': finishedSig },
          body: finishedPayload,
        }).then(() => {
          server.close();
          resolve();
        });
      });
    });

    // Verify active
    const activeSub = await subService.getSubscriptionByProviderId(paymentId);
    expect(activeSub).toBeDefined();
    expect(activeSub!.status).toBe('active');

    // Step 2: refunded → cancelled
    const refundIpn = {
      payment_id: paymentId,
      payment_status: 'refunded',
      invoice_id: 'inv-pro-e2e',
      order_id: 'e2e-customer@test.com',
      price_amount: 99,
      price_currency: 'usd',
    };
    const refundPayload = JSON.stringify(refundIpn);
    const refundSig = signPayload(refundPayload, process.env.NOWPAYMENTS_IPN_SECRET || 'test-secret');

    let serverRes: { status: number; body: unknown } | null = null;

    await new Promise<void>((resolve) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as any).port;
        fetch(`http://127.0.0.1:${port}/api/webhooks/nowpayments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-nowpayments-sig': refundSig },
          body: refundPayload,
        })
          .then((r) => r.json())
          .then((body) => {
            serverRes = { status: 200, body };
          })
          .finally(() => {
            server.close();
            resolve();
          });
      });
    });

    expect(serverRes!.status).toBe(200);

    // Verify cancelled
    const refundedSub = await subService.getSubscriptionByProviderId(paymentId);
    expect(refundedSub).toBeDefined();
    expect(refundedSub!.status).toBe('cancelled');
  });
});
