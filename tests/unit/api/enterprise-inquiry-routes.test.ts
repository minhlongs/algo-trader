import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enterpriseInquiryRouter } from '../../../src/api/routes/enterprise-inquiry-routes';
import { EnterpriseOnboardingService } from '@platform/billing/enterprise-onboarding-service';
import type { Request, Response } from 'express';

describe('enterpriseInquiryRouter branch coverage', () => {
  let mockRes: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
  });

  const getHandler = (method: string, path: string) => {
    const route = (enterpriseInquiryRouter.stack as any[]).find(
      (layer) => layer.route && layer.route.path === path && layer.route.methods[method]
    );
    return route?.route.stack[0].handle;
  };

  it('POST /inquiries validates missing fields', async () => {
    const handler = getHandler('post', '/inquiries');
    const req = { body: { email: 'test@example.com' } } as Request;

    await handler(req, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Missing required fields') })
    );
  });

  it('POST /inquiries handles submission success and custom error statuses', async () => {
    const handler = getHandler('post', '/inquiries');
    const validBody = {
      email: 'corp@example.com',
      companyName: 'Acme Corp',
      contactName: 'Alice',
      tier: 'enterprise',
      useCase: 'Algorithmic Execution',
      teamSize: '15',
    };

    const service = EnterpriseOnboardingService.getInstance();
    vi.spyOn(service, 'submitInquiry').mockResolvedValueOnce({
      inquiryId: 'inq-1',
      status: 'new',
    } as any);

    const reqSuccess = { body: validBody } as Request;
    await handler(reqSuccess, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(201);

    // Conflict error (already exists)
    vi.spyOn(service, 'submitInquiry').mockRejectedValueOnce(new Error('Inquiry already exists'));
    await handler(reqSuccess, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(409);

    // Validation error
    vi.spyOn(service, 'submitInquiry').mockRejectedValueOnce(new Error('Invalid email domain'));
    await handler(reqSuccess, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(400);

    // General error
    vi.spyOn(service, 'submitInquiry').mockRejectedValueOnce(new Error('Internal server timeout'));
    await handler(reqSuccess, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(500);
  });

  it('GET /inquiries enforces admin auth and lists inquiries', () => {
    const handler = getHandler('get', '/inquiries');

    // Non-admin request
    const nonAdminReq = { claims: { role: 'user' } } as any;
    handler(nonAdminReq, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(403);

    // Admin request
    const adminReq = { claims: { role: 'admin' } } as any;
    const service = EnterpriseOnboardingService.getInstance();
    vi.spyOn(service, 'listInquiries').mockReturnValue([{ id: 'inq-1' }] as any);

    handler(adminReq, mockRes as Response);
    expect(jsonMock).toHaveBeenCalledWith([{ id: 'inq-1' }]);
  });

  it('GET /inquiries/:id enforces admin auth and returns 404 or inquiry', () => {
    const handler = getHandler('get', '/inquiries/:id');

    // Non-admin request
    const nonAdminReq = { params: { id: 'inq-1' } } as any;
    handler(nonAdminReq, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(403);

    // Admin not found
    const adminReq = { params: { id: 'inq-missing' }, claims: { role: 'admin' } } as any;
    const service = EnterpriseOnboardingService.getInstance();
    vi.spyOn(service, 'getInquiry').mockReturnValue(null);

    handler(adminReq, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(404);

    // Admin found
    vi.spyOn(service, 'getInquiry').mockReturnValue({ id: 'inq-1' } as any);
    handler({ params: { id: 'inq-1' }, claims: { role: 'admin' } } as any, mockRes as Response);
    expect(jsonMock).toHaveBeenCalledWith({ id: 'inq-1' });
  });

  it('PATCH /inquiries/:id/status updates inquiry fields or returns errors', () => {
    const handler = getHandler('patch', '/inquiries/:id/status');

    // Non-admin request
    handler({ params: { id: 'inq-1' } } as any, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(403);

    // Admin with invalid status
    const adminReqInvalid = {
      params: { id: 'inq-1' },
      claims: { role: 'admin' },
      body: { status: 'INVALID_STATUS' },
    } as any;
    handler(adminReqInvalid, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(400);

    // Admin with valid patch but inquiry not found
    const service = EnterpriseOnboardingService.getInstance();
    vi.spyOn(service, 'updateInquiry').mockReturnValue(null);
    const adminReqValid = {
      params: { id: 'inq-missing' },
      claims: { role: 'admin' },
      body: { status: 'contacted', tamAssigned: 'tam@acme.com', notes: 'Call scheduled' },
    } as any;
    handler(adminReqValid, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(404);

    // Admin update successful
    vi.spyOn(service, 'updateInquiry').mockReturnValue({ id: 'inq-1', status: 'contacted' } as any);
    handler(adminReqValid, mockRes as Response);
    expect(jsonMock).toHaveBeenCalledWith({ id: 'inq-1', status: 'contacted' });
  });
});
