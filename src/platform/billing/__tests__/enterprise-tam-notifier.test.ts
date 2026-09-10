/**
 * Enterprise TAM Notifier Tests
 * Covers notifyTam happy path, EmailService not initialized fallback,
 * send failure handling, email body/html formatting, and env override
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnterpriseInquiry } from '../enterprise-inquiry-store';

const { mockLogger, mockSend, mockInitialize, mockIsInitialized, mockGetInstance } = vi.hoisted(() => {
  const isInitialized = vi.fn().mockReturnValue(true);
  return {
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    mockSend: vi.fn().mockResolvedValue(true),
    mockInitialize: vi.fn().mockReturnValue(true),
    mockIsInitialized: isInitialized,
    mockGetInstance: vi.fn(),
  };
});

vi.mock('../../utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../notifications/email-service', () => ({
  EmailService: {
    getInstance: mockGetInstance,
  },
}));

import { notifyTam } from '../enterprise-tam-notifier';

function makeInquiry(overrides: Partial<EnterpriseInquiry> = {}): EnterpriseInquiry {
  const defaults: EnterpriseInquiry = {
    id: 'ent-001',
    companyName: 'Acme Corp',
    contactName: 'Jane Doe',
    email: 'jane@acme.com',
    tier: 'enterprise',
    teamSize: '15',
    useCase: 'Multi-strategy institutional deployment',
    createdAt: '2026-09-01T12:00:00Z',
  };
  return { ...defaults, ...overrides };
}

describe('Enterprise TAM Notifier', () => {
  let fakeEmailSvc: any;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeEmailSvc = {
      isInitialized: mockIsInitialized,
      initialize: mockInitialize,
      send: mockSend,
    };
    mockGetInstance.mockReturnValue(fakeEmailSvc);
    mockIsInitialized.mockReturnValue(true);
    mockSend.mockResolvedValue(true);
    delete process.env['ENTERPRISE_TAM_EMAIL'];
  });

  // ── notifyTam happy path ──────────────────────────────────────────────────

  describe('notifyTam', () => {
    it('sends email and returns true on success', async () => {
      const result = await notifyTam(makeInquiry());
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('TAM notified'),
        expect.objectContaining({ inquiryId: 'ent-001' }),
      );
    });

    it('initializes EmailService if not yet initialized', async () => {
      mockIsInitialized
        .mockReturnValueOnce(false)  // first check before initialize()
        .mockReturnValueOnce(true);  // second check after initialize()
      const result = await notifyTam(makeInquiry());
      expect(mockInitialize).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it('returns false and warns when EmailService still not configured after initialize', async () => {
      mockIsInitialized.mockReturnValue(false);
      const result = await notifyTam(makeInquiry());
      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('EmailService not configured'),
        expect.objectContaining({ inquiryId: 'ent-001' }),
      );
    });

    it('returns false and warns on send failure', async () => {
      mockSend.mockRejectedValue(new Error('SMTP timeout'));
      const result = await notifyTam(makeInquiry());
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to notify TAM'),
        expect.objectContaining({ error: 'SMTP timeout' }),
      );
    });

    it('handles non-Error thrown values gracefully', async () => {
      mockSend.mockRejectedValue('string error');
      const result = await notifyTam(makeInquiry());
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to notify TAM'),
        expect.objectContaining({ error: 'string error' }),
      );
    });
  });

  // ── email content ─────────────────────────────────────────────────────────

  describe('email content', () => {
    it('includes inquiry details in the email body', async () => {
      const inquiry = makeInquiry();
      await notifyTam(inquiry);
      const [opts] = mockSend.mock.calls[0]!;
      expect(opts.body).toContain('NEW ENTERPRISE INQUIRY');
      expect(opts.body).toContain('ID:        ent-001');
      expect(opts.body).toContain('Company:   Acme Corp');
      expect(opts.body).toContain('Contact:   Jane Doe <jane@acme.com>');
      expect(opts.body).toContain('Team size: 15');
      expect(opts.body).toContain('Multi-strategy institutional deployment');
    });

    it('includes HTML with escaped HTML characters', async () => {
      const inquiry = makeInquiry({
        companyName: 'O\'Brien & Sons <Inc>',
        useCase: '<script>alert("xss")</script>',
      });
      await notifyTam(inquiry);
      const [opts] = mockSend.mock.calls[0]!;
      expect(opts.html).toContain("O'Brien &amp; Sons &lt;Inc&gt;");
      expect(opts.html).toContain('&lt;script&gt;alert("xss")&lt;/script&gt;');
    });

    it('includes the correct subject with tier label', async () => {
      const inquiry = makeInquiry({ tier: 'enterprise', companyName: 'Globex' });
      await notifyTam(inquiry);
      const [opts] = mockSend.mock.calls[0]!;
      expect(opts.subject).toContain('Globex');
      expect(opts.subject).toContain('Enterprise — $299/mo');
    });

    it('sends to the default TAM email when env is not set', async () => {
      await notifyTam(makeInquiry());
      const [sendOpts] = mockSend.mock.calls[0]!;
      expect(sendOpts.to).toBe('tam@cashclaw.cc');
    });

    it('uses ENTERPRISE_TAM_EMAIL env var when set', async () => {
      process.env['ENTERPRISE_TAM_EMAIL'] = 'custom-tam@company.com';
      await notifyTam(makeInquiry());
      const [sendOpts] = mockSend.mock.calls[0]!;
      expect(sendOpts.to).toBe('custom-tam@company.com');
    });

    it('shows "not specified" when teamSize is undefined', async () => {
      await notifyTam(makeInquiry({ teamSize: undefined }));
      const [opts] = mockSend.mock.calls[0]!;
      expect(opts.body).toContain('Team size: not specified');
      expect(opts.html).toContain('—');
    });
  });
});
