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
  EmailService: { getInstance: mockGetInstance },
}));

import { notifyTam } from '../enterprise-tam-notifier';

function makeInquiry(overrides: Partial<EnterpriseInquiry> = {}): EnterpriseInquiry {
  return {
    id: 'ent-001',
    companyName: 'Acme Corp',
    contactName: 'Jane Doe',
    email: 'jane@acme.com',
    tier: 'enterprise',
    teamSize: '15',
    useCase: 'Multi-strategy institutional deployment',
    createdAt: '2026-09-01T12:00:00Z',
    ...overrides,
  };
}

describe('Enterprise TAM Notifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInstance.mockReturnValue({
      isInitialized: mockIsInitialized,
      initialize: mockInitialize,
      send: mockSend,
    });
    mockIsInitialized.mockReturnValue(true);
    mockSend.mockResolvedValue(true);
    delete process.env['ENTERPRISE_TAM_EMAIL'];
  });

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
      mockIsInitialized.mockReturnValueOnce(false).mockReturnValueOnce(true);
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

    it('returns false and warns on Error or non-Error send failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('SMTP timeout'));
      expect(await notifyTam(makeInquiry())).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to notify TAM'),
        expect.objectContaining({ error: 'SMTP timeout' }),
      );

      mockSend.mockRejectedValueOnce('string error');
      expect(await notifyTam(makeInquiry())).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to notify TAM'),
        expect.objectContaining({ error: 'string error' }),
      );
    });
  });

  describe('email content', () => {
    it('includes inquiry details in the email body', async () => {
      await notifyTam(makeInquiry());
      const [opts] = mockSend.mock.calls[0]!;
      expect(opts.body).toContain('NEW ENTERPRISE INQUIRY');
      expect(opts.body).toContain('ID:        ent-001');
      expect(opts.body).toContain('Company:   Acme Corp');
      expect(opts.body).toContain('Contact:   Jane Doe <jane@acme.com>');
      expect(opts.body).toContain('Team size: 15');
      expect(opts.body).toContain('Multi-strategy institutional deployment');
    });

    it('includes HTML with escaped HTML characters', async () => {
      await notifyTam(makeInquiry({
        companyName: 'O\'Brien & Sons <Inc>',
        useCase: '<script>alert("xss")</script>',
      }));
      const [opts] = mockSend.mock.calls[0]!;
      expect(opts.html).toContain("O'Brien &amp; Sons &lt;Inc&gt;");
      expect(opts.html).toContain('&lt;script&gt;alert("xss")&lt;/script&gt;');
    });

    it('includes the correct subject with tier label', async () => {
      await notifyTam(makeInquiry({ tier: 'enterprise', companyName: 'Globex' }));
      const [opts] = mockSend.mock.calls[0]!;
      expect(opts.subject).toContain('Globex');
      expect(opts.subject).toContain('Enterprise — $299/mo');
    });

    it('uses default TAM email or ENTERPRISE_TAM_EMAIL env var when set', async () => {
      await notifyTam(makeInquiry());
      expect(mockSend.mock.calls[0]![0].to).toBe('tam@cashclaw.cc');

      process.env['ENTERPRISE_TAM_EMAIL'] = 'custom-tam@company.com';
      await notifyTam(makeInquiry());
      expect(mockSend.mock.calls[1]![0].to).toBe('custom-tam@company.com');
    });

    it('shows "not specified" when teamSize is undefined', async () => {
      await notifyTam(makeInquiry({ teamSize: undefined }));
      const [opts] = mockSend.mock.calls[0]!;
      expect(opts.body).toContain('Team size: not specified');
      expect(opts.html).toContain('—');
    });
  });
});
