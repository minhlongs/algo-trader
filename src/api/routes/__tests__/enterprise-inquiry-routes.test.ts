/**
 * Unit tests for enterprise-inquiry-routes.ts
 * Uses express + supertest to exercise POST/GET/PATCH endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies before importing route module
vi.mock('@platform/billing/enterprise-onboarding-service', () => ({
  EnterpriseOnboardingService: {
    getInstance: () => ({
      submitInquiry: vi.fn().mockResolvedValue({
        inquiryId: 'enq_test-123',
        status: 'received',
        paperDemo: null,
        message: 'Inquiry received. Our team will contact you within 24 hours.',
      }),
      listInquiries: vi.fn().mockReturnValue([]),
      getInquiry: vi.fn().mockImplementation((id: string) =>
        id === 'enq_known' ? { id: 'enq_known', status: 'new' } : undefined
      ),
      updateInquiry: vi.fn().mockImplementation((id: string) =>
        id === 'enq_known' ? { id: 'enq_known', status: 'contacted' } : undefined
      ),
    }),
  },
}));

vi.mock('@platform/billing/enterprise-inquiry-store', () => ({
  enterpriseInquiryStore: {},
}));

vi.mock('@platform/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { enterpriseInquiryRouter } from '../enterprise-inquiry-routes';

function buildApp(adminClaims = false) {
  const app = express();
  app.use(express.json());
  // Simulate auth middleware populating req.claims
  app.use((req, _res, next) => {
    if (adminClaims) {
      (req as express.Request & { claims: unknown }).claims = { role: 'admin' };
    }
    next();
  });
  app.use('/', enterpriseInquiryRouter);
  return app;
}

const VALID_INQUIRY = {
  email: 'cto@acme.com',
  companyName: 'Acme Corp',
  contactName: 'Alice',
  tier: 'pro',
  useCase: 'Automate prediction market operations for our desk',
};

describe('POST /inquiries', () => {
  it('returns 201 with inquiryId on valid submission', async () => {
    const res = await request(buildApp()).post('/inquiries').send(VALID_INQUIRY);
    expect(res.status).toBe(201);
    expect(res.body.inquiryId).toBe('enq_test-123');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(buildApp()).post('/inquiries').send({ email: 'x@y.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required fields/);
  });
});

describe('GET /inquiries', () => {
  it('returns 403 for non-admin callers', async () => {
    const res = await request(buildApp(false)).get('/inquiries');
    expect(res.status).toBe(403);
  });

  it('returns 200 with empty array for admin when no inquiries', async () => {
    const res = await request(buildApp(true)).get('/inquiries');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /inquiries/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await request(buildApp(true)).get('/inquiries/enq_unknown');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /inquiries/:id/status', () => {
  it('returns 400 for invalid status value', async () => {
    const res = await request(buildApp(true))
      .patch('/inquiries/enq_known/status')
      .send({ status: 'invalid_status' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with updated inquiry on valid patch', async () => {
    const res = await request(buildApp(true))
      .patch('/inquiries/enq_known/status')
      .send({ status: 'contacted' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('contacted');
  });
});
