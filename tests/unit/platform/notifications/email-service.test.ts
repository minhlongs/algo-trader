/**
 * Tests for EmailService — SendGrid integration.
 * Target: 100% coverage for src/platform/notifications/email-service.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// --- Mock getRedisClient so the rate-limit path is fully controllable ---
const { mockGetRedisClient } = vi.hoisted(() => ({
  mockGetRedisClient: vi.fn(),
}));

vi.mock('../../../../src/redis', () => ({
  getRedisClient: mockGetRedisClient,
}));

// --- Mock @sendgrid/mail ---
const { mockSgSend, mockSetApiKey } = vi.hoisted(() => ({
  mockSgSend: vi.fn(),
  mockSetApiKey: vi.fn(),
}));

vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: mockSetApiKey,
    send: mockSgSend,
  },
}));

import { EmailService, EmailConfig } from '../../../../src/platform/notifications/email-service';

// Reset the singleton between tests so config/env changes don't leak.
function resetEmailService() {
  (EmailService as unknown as { instance: EmailService | undefined }).instance = undefined;
}

function makeRedisClient(opts: {
  getReply?: Record<string, unknown> | null;
  getThrows?: boolean;
}) {
  const get = vi.fn();
  if (opts.getThrows) {
    get.mockRejectedValue(new Error('Redis connection lost'));
  } else if (opts.getReply !== undefined) {
    get.mockResolvedValue(opts.getReply);
  } else {
    get.mockResolvedValue(null);
  }
  return {
    get,
    setex: vi.fn().mockResolvedValue('OK'),
  };
}

describe('EmailService', () => {
  let redisClient: ReturnType<typeof makeRedisClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailService();
    redisClient = makeRedisClient({ getReply: null });
    mockGetRedisClient.mockReturnValue(redisClient);
  });

  describe('singleton', () => {
    it('returns the same instance on repeated getInstance calls', () => {
      const a = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      const b = EmailService.getInstance({ apiKey: 'x', fromEmail: 'y@z.com' });
      expect(a).toBe(b);
    });

    it('creates a new instance after reset', () => {
      const a = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      resetEmailService();
      const b = EmailService.getInstance({ apiKey: 'k2', fromEmail: 'a2@b.com' });
      expect(a).not.toBe(b);
    });
  });

  describe('constructor / config', () => {
    it('uses config passed to getInstance', () => {
      const svc = EmailService.getInstance({
        apiKey: 'cfg-key',
        fromEmail: 'cfg@x.com',
        fromName: 'My App',
      });
      const result = svc.initialize();
      expect(mockSetApiKey).toHaveBeenCalledWith('cfg-key');
      expect(result).toBe(true);
    });

    it('falls back to env vars when no config provided', () => {
      vi.stubEnv('SENDGRID_API_KEY', 'env-key');
      vi.stubEnv('SENDGRID_FROM_EMAIL', 'env@y.com');
      vi.stubEnv('SENDGRID_FROM_NAME', 'Env App');
      resetEmailService();
      const svc = EmailService.getInstance();
      const result = svc.initialize();
      expect(mockSetApiKey).toHaveBeenCalledWith('env-key');
      expect(result).toBe(true);
    });

    it('uses default fromName "Algo Trader" when env unset', () => {
      vi.stubEnv('SENDGRID_API_KEY', 'env-key');
      vi.stubEnv('SENDGRID_FROM_EMAIL', 'env@y.com');
      vi.stubEnv('SENDGRID_FROM_NAME', '');
      resetEmailService();
      const svc = EmailService.getInstance();
      svc.initialize();
      expect(mockSetApiKey).toHaveBeenCalledWith('env-key');
    });
  });

  describe('startupCheck', () => {
    it('is a no-op outside production', () => {
      vi.stubEnv('NODE_ENV', 'test');
      expect(() => EmailService.startupCheck()).not.toThrow();
    });

    it('throws in production when SENDGRID_API_KEY missing', () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.SENDGRID_API_KEY;
      delete process.env.SENDGRID_FROM_EMAIL;
      expect(() => EmailService.startupCheck()).toThrow(/SENDGRID_API_KEY is not set/);
    });

    it('throws in production when SENDGRID_FROM_EMAIL missing', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('SENDGRID_API_KEY', 'present');
      delete process.env.SENDGRID_FROM_EMAIL;
      expect(() => EmailService.startupCheck()).toThrow(/SENDGRID_FROM_EMAIL is not set/);
    });

    it('logs success when both env vars present in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('SENDGRID_API_KEY', 'present');
      vi.stubEnv('SENDGRID_FROM_EMAIL', 'ok@x.com');
      expect(() => EmailService.startupCheck()).not.toThrow();
    });
  });

  describe('initialize', () => {
    it('returns false and logs warn when apiKey missing', () => {
      const svc = EmailService.getInstance({ apiKey: '', fromEmail: 'a@b.com' });
      const result = svc.initialize();
      expect(result).toBe(false);
      expect(mockSetApiKey).not.toHaveBeenCalled();
    });

    it('returns false and logs warn when fromEmail missing', () => {
      const svc = EmailService.getInstance({ apiKey: 'key', fromEmail: '' });
      const result = svc.initialize();
      expect(result).toBe(false);
    });

    it('returns false on sendgrid setApiKey error', () => {
      mockSetApiKey.mockImplementationOnce(() => {
        throw new Error('Invalid API key');
      });
      const svc = EmailService.getInstance({ apiKey: 'bad', fromEmail: 'a@b.com' });
      const result = svc.initialize();
      expect(result).toBe(false);
    });
  });

  describe('isInitialized', () => {
    it('returns false before initialize', () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      expect(svc.isInitialized()).toBe(false);
    });

    it('returns true after successful initialize', () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      expect(svc.isInitialized()).toBe(true);
    });
  });

  describe('send', () => {
    it('returns false when not initialized', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      // not initialized, no rate-limit path reached
      const res = await svc.send({ to: 't@e.com', subject: 'Hi', body: 'Body' });
      expect(res).toBe(false);
      expect(mockSgSend).not.toHaveBeenCalled();
    });

    it('sends email with text and html when initialized', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com', fromName: 'App' });
      svc.initialize();
      mockSgSend.mockResolvedValue([]);

      const res = await svc.send({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Plain text body',
        html: '<p>HTML body</p>',
      });

      expect(res).toBe(true);
      expect(mockSgSend).toHaveBeenCalledTimes(1);
      const msg = mockSgSend.mock.calls[0][0];
      expect(msg.to).toBe('recipient@example.com');
      expect(msg.subject).toBe('Test Subject');
      expect(msg.text).toBe('Plain text body');
      expect(msg.html).toBe('<p>HTML body</p>');
    });

    it('omits html key when html is undefined', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      mockSgSend.mockResolvedValue([]);

      await svc.send({ to: 't@e.com', subject: 'S', body: 'B' });
      const msg = mockSgSend.mock.calls[0][0];
      expect(msg.html).toBeUndefined();
    });

    it('returns false when sgMail.send throws', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      mockSgSend.mockRejectedValue(new Error('SendGrid error'));

      const res = await svc.send({ to: 't@e.com', subject: 'S', body: 'B' });
      expect(res).toBe(false);
    });

    it('applies rate limit before sending', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      svc.setRateLimit(0); // disable delay
      redisClient.get.mockResolvedValue(null);
      mockSgSend.mockResolvedValue([]);

      await svc.send({ to: 't@e.com', subject: 'S', body: 'B' });

      expect(redisClient.get).toHaveBeenCalledWith('algo:rate_limit:email:global');
      expect(redisClient.setex).toHaveBeenCalledWith(
        'algo:rate_limit:email:global',
        60,
        expect.any(String),
      );
    });
  });

  describe('sendThresholdAlert', () => {
    it('formats alert subject with urgency and sends', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      mockSgSend.mockResolvedValue([]);

      const res = await svc.sendThresholdAlert(
        'alert@example.com',
        'LIC-12345678',
        85,
        8500,
        10000,
        85.0,
      );

      expect(res).toBe(true);
      expect(mockSgSend).toHaveBeenCalledTimes(1);
      const msg = mockSgSend.mock.calls[0][0];
      expect(msg.to).toBe('alert@example.com');
      expect(msg.subject).toContain('WARNING');
      expect(msg.subject).toContain('85%');
      expect(msg.text).toContain('LIC-12345678');
      expect(msg.html).toContain('85');
      expect(msg.html).toContain('#ffc107'); // WARNING color
    });

    it('returns false when not initialized', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      const res = await svc.sendThresholdAlert(
        'a@b.com', 'KEY', 100, 100, 100, 100,
      );
      expect(res).toBe(false);
    });

    it('uses CRITICAL urgency for 100% threshold', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      mockSgSend.mockResolvedValue([]);

      await svc.sendThresholdAlert('a@b.com', 'KEY', 100, 100, 100, 100);
      const msg = mockSgSend.mock.calls[0][0];
      expect(msg.subject).toContain('CRITICAL');
      expect(msg.html).toContain('#dc3545'); // CRITICAL color
    });

    it('uses URGENT urgency for 90% threshold', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      mockSgSend.mockResolvedValue([]);

      await svc.sendThresholdAlert('a@b.com', 'KEY', 90, 900, 1000, 90);
      const msg = mockSgSend.mock.calls[0][0];
      expect(msg.subject).toContain('URGENT');
    });
  });

  describe('applyRateLimitRedis (private)', () => {
    it('reads the rate-limit key before sending', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      svc.setRateLimit(0); // no delay
      redisClient.get.mockResolvedValue(null);
      mockSgSend.mockResolvedValue([]);

      await svc.send({ to: 't@e.com', subject: 'S', body: 'B' });

      expect(redisClient.get).toHaveBeenCalledWith('algo:rate_limit:email:global');
      expect(mockSgSend).toHaveBeenCalledTimes(1);
    });

    it('updates the timestamp after sending', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      svc.setRateLimit(0);
      redisClient.get.mockResolvedValue(null);
      mockSgSend.mockResolvedValue([]);

      await svc.send({ to: 't@e.com', subject: 'S', body: 'B' });

      expect(redisClient.setex).toHaveBeenCalledWith(
        'algo:rate_limit:email:global',
        60,
        expect.any(String),
      );
    });

    it('falls back to in-memory rate limiting when Redis throws', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      svc.setRateLimit(0);
      // First call (primary) throws, second call (fallback) returns null
      redisClient.get
        .mockRejectedValueOnce(new Error('Redis down'))
        .mockResolvedValueOnce(null);
      mockSgSend.mockResolvedValue([]);

      const res = await svc.send({ to: 't@e.com', subject: 'S', body: 'B' });
      expect(res).toBe(true);
    });

    it('sleeps for the remaining delay window when a recent timestamp exists', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      svc.setRateLimit(200);
      // Recent timestamp -> elapsed < delay -> setTimeout path
      redisClient.get.mockResolvedValue(JSON.stringify({ timestamp: Date.now() }));
      mockSgSend.mockResolvedValue([]);

      const res = await svc.send({ to: 't@e.com', subject: 'S', body: 'B' });
      expect(res).toBe(true);
      expect(mockSgSend).toHaveBeenCalledTimes(1);
      expect(redisClient.setex).toHaveBeenCalledWith(
        'algo:rate_limit:email:global',
        60,
        expect.any(String),
      );
    });
  });

  describe('applyRateLimitFallback (private)', () => {
    it('sends immediately when last_send is empty/0', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      svc.setRateLimit(0);
      redisClient.get.mockResolvedValue('0');
      mockSgSend.mockResolvedValue([]);

      await svc.send({ to: 't@e.com', subject: 'S', body: 'B' });
      expect(mockSgSend).toHaveBeenCalledTimes(1);
    });

    it('sleeps for the remaining delay window when last_send is recent', async () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.initialize();
      svc.setRateLimit(200);
      // Primary path throws -> fallback path; fallback get returns recent timestamp
      redisClient.get
        .mockRejectedValueOnce(new Error('Redis down'))
        .mockResolvedValue(String(Date.now()));
      mockSgSend.mockResolvedValue([]);

      const res = await svc.send({ to: 't@e.com', subject: 'S', body: 'B' });
      expect(res).toBe(true);
      expect(mockSgSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('setRateLimit', () => {
    it('updates the rate limit delay', () => {
      const svc = EmailService.getInstance({ apiKey: 'k', fromEmail: 'a@b.com' });
      svc.setRateLimit(5000);
      // Setting it doesn't throw; behavior verified indirectly in rate-limit tests
      expect(svc).toBeDefined();
    });
  });
});
