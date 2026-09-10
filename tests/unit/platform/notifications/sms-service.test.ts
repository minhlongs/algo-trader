/**
 * SmsService — Comprehensive Coverage Tests
 *
 * Covers src/platform/notifications/sms-service.ts:
 * - initialize (success, missing config, error)
 * - isInitialized
 * - send (not initialized, rate limit, daily limit, success, error)
 * - sendThresholdAlert (skips < 90%, formats and sends >= 90%)
 * - checkDailyLimitRedis (allow, block, redis error allow)
 * - incrementDailyCountRedis (increment, redis error swallow)
 * - applyRateLimitRedis (no wait, wait, redis error swallow)
 * - setRateLimit, setDailyLimit
 * - singleton getInstance
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks
const mockTwilioClient = vi.hoisted(() => ({
  messages: {
    create: vi.fn(),
  },
}));

const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  setex: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

// Mock modules BEFORE import
vi.mock('twilio', () => ({
  default: vi.fn(() => mockTwilioClient),
}));

vi.mock('../../../../src/redis', () => ({
  getRedisClient: vi.fn(() => mockRedis),
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../src/platform/notifications/alert-formatter', () => ({
  formatSmsBody: vi.fn(({ threshold, licenseKey, currentUsage, dailyLimit, percentUsed }) =>
    `ALGO TRADER [${threshold >= 100 ? 'CRITICAL' : threshold >= 90 ? 'URGENT' : 'WARNING'}]
Key: *${licenseKey.slice(-8)}
Usage: ${currentUsage}/${dailyLimit} (${percentUsed.toFixed(0)}%)
${threshold >= 100 ? 'LIMIT REACHED. Overage charges applying. Upgrade now.' : threshold >= 90 ? 'LIMIT NEAR. Upgrade recommended to avoid overage.' : 'Monitor usage to avoid overage charges.'}
Reply STOP to opt out`,
  ),
}));

// Import AFTER mocks
import { SmsService, smsService } from '../../../../src/platform/notifications/sms-service';

describe('SmsService — sms-service.ts', () => {
  let service: SmsService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton
    (SmsService as any).instance = undefined;

    // Default env
    process.env.TWILIO_ACCOUNT_SID = 'AC_test';
    process.env.TWILIO_AUTH_TOKEN = 'token_test';
    process.env.TWILIO_PHONE_NUMBER = '+15551234567';

    service = SmsService.getInstance();
    // Disable the 5s default rate-limit delay so send() doesn't exceed test timeout
    service.setRateLimit(0);
  });

  afterEach(() => {
    vi.resetModules();
    (SmsService as any).instance = undefined;
  });

  // ============================================================
  // initialize
  // ============================================================
  describe('initialize', () => {
    it('returns true and creates client when config is complete', () => {
      const result = service.initialize();

      expect(result).toBe(true);
      expect(service.isInitialized()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('[SmsService] Initialized with Twilio');
    });

    it('returns false and warns when TWILIO_ACCOUNT_SID missing', () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      (SmsService as any).instance = undefined;
      const svc = SmsService.getInstance();

      const result = svc.initialize();

      expect(result).toBe(false);
      expect(svc.isInitialized()).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('[SmsService] Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER');
    });

    it('returns false and warns when TWILIO_AUTH_TOKEN missing', () => {
      delete process.env.TWILIO_AUTH_TOKEN;
      (SmsService as any).instance = undefined;
      const svc = SmsService.getInstance();

      const result = svc.initialize();

      expect(result).toBe(false);
    });

    it('returns false and warns when TWILIO_PHONE_NUMBER missing', () => {
      delete process.env.TWILIO_PHONE_NUMBER;
      (SmsService as any).instance = undefined;
      const svc = SmsService.getInstance();

      const result = svc.initialize();

      expect(result).toBe(false);
    });

    it('returns false and logs error when twilio constructor throws', async () => {
      const { default: twilio } = await import('twilio');
      vi.mocked(twilio).mockImplementationOnce(() => { throw new Error('Twilio init failed'); });
      (SmsService as any).instance = undefined;
      const svc = SmsService.getInstance();

      const result = svc.initialize();

      expect(result).toBe(false);
      expect(svc.isInitialized()).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('[SmsService] Initialization failed:', { error: expect.any(Error) });
    });

    it('accepts custom config overriding env', () => {
      (SmsService as any).instance = undefined;
      const svc = SmsService.getInstance({
        accountSid: 'AC_custom',
        authToken: 'token_custom',
        fromPhoneNumber: '+15559999999',
      });

      const result = svc.initialize();

      expect(result).toBe(true);
    });
  });

  // ============================================================
  // isInitialized
  // ============================================================
  describe('isInitialized', () => {
    it('returns false before initialize', () => {
      expect(service.isInitialized()).toBe(false);
    });

    it('returns true after successful initialize', () => {
      service.initialize();
      expect(service.isInitialized()).toBe(true);
    });

    it('returns false after failed initialize', () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      (SmsService as any).instance = undefined;
      const svc = SmsService.getInstance();
      svc.initialize();
      expect(svc.isInitialized()).toBe(false);
    });
  });

  // ============================================================
  // send
  // ============================================================
  describe('send', () => {
    beforeEach(() => {
      service.initialize();
      service.setRateLimit(0); // disable rate limit delay for fast tests
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.setex.mockResolvedValue('OK');
    });

    it('returns false when not initialized', async () => {
      (SmsService as any).instance = undefined;
      const svc = SmsService.getInstance(); // not initialized

      const result = await svc.send({ to: '+15559876543', message: 'test' });

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('[SmsService] Not initialized, skipping SMS');
    });

    it('applies rate limiting via Redis', async () => {
      await service.send({ to: '+15559876543', message: 'test' });

      expect(mockRedis.get).toHaveBeenCalledWith('algo:rate_limit:sms:last_send');
      expect(mockRedis.setex).toHaveBeenCalledWith('algo:rate_limit:sms:last_send', 3600, expect.any(String));
    });

    it('waits when rate limit not elapsed', async () => {
      service.setRateLimit(100);
      const now = Date.now();
      mockRedis.get.mockResolvedValueOnce(String(now - 10)); // 10ms ago, < 100ms delay

      const start = Date.now();
      await service.send({ to: '+15559876543', message: 'test' });
      const elapsed = Date.now() - start;

      // Should have waited ~90ms (delay - elapsed)
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });

    it('checks daily limit via Redis', async () => {
      mockRedis.get.mockResolvedValueOnce(null); // rate limit key
      mockRedis.get.mockResolvedValueOnce(null); // daily limit key

      await service.send({ to: '+15559876543', message: 'test' });

      expect(mockRedis.get).toHaveBeenCalledWith('algo:rate_limit:sms:daily:+15559876543');
    });

    it('returns false when daily limit reached', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null) // rate limit
        .mockResolvedValueOnce('10'); // daily count = limit

      const result = await service.send({ to: '+15559876543', message: 'test' });

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('[SmsService] Daily limit reached for +15559876543');
    });

    it('returns true and increments count on successful send', async () => {
      mockTwilioClient.messages.create.mockResolvedValue({ sid: 'SM_test123' });
      mockRedis.get
        .mockResolvedValueOnce(null) // rate limit
        .mockResolvedValueOnce(null); // daily limit

      const result = await service.send({ to: '+15559876543', message: 'test message' });

      expect(result).toBe(true);
      expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
        body: 'test message',
        from: '+15551234567',
        to: '+15559876543',
      });
      expect(mockRedis.incr).toHaveBeenCalledWith('algo:rate_limit:sms:daily:+15559876543');
      expect(mockRedis.expire).toHaveBeenCalledWith('algo:rate_limit:sms:daily:+15559876543', 86400);
      expect(mockLogger.info).toHaveBeenCalledWith('[SmsService] SMS sent to +15559876543: SM_test123');
    });

    it('returns false and logs error when twilio throws', async () => {
      mockTwilioClient.messages.create.mockRejectedValue(new Error('Twilio API error'));
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.send({ to: '+15559876543', message: 'test' });

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('[SmsService] Send failed:', { error: expect.any(Error) });
    });

    it('allows send when redis daily limit check fails (fail-open)', async () => {
      mockTwilioClient.messages.create.mockResolvedValue({ sid: 'SM_test' });
      mockRedis.get
        .mockResolvedValueOnce(null) // rate limit
        .mockRejectedValueOnce(new Error('Redis down')); // daily limit check fails

      const result = await service.send({ to: '+15559876543', message: 'test' });

      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith('[SmsService] Redis daily limit check failed:', { error: expect.any(Error) });
    });

    it('continues when redis rate limiting fails', async () => {
      mockTwilioClient.messages.create.mockResolvedValue({ sid: 'SM_test' });
      mockRedis.get.mockRejectedValue(new Error('Redis down')); // rate limit fails

      const result = await service.send({ to: '+15559876543', message: 'test' });

      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith('[SmsService] Redis rate limiting failed:', { error: expect.any(Error) });
    });
  });

  // ============================================================
  // sendThresholdAlert
  // ============================================================
  describe('sendThresholdAlert', () => {
    beforeEach(() => {
      service.initialize();
      service.setRateLimit(0);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.setex.mockResolvedValue('OK');
      mockTwilioClient.messages.create.mockResolvedValue({ sid: 'SM_alert' });
    });

    it('returns false for threshold < 90', async () => {
      const result = await service.sendThresholdAlert('+15559876543', 'LIC_key123', 80, 80, 100, 80);

      expect(result).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('[SmsService] Skipping SMS for threshold 80% (< 90%)');
      expect(mockTwilioClient.messages.create).not.toHaveBeenCalled();
    });

    it('sends SMS for threshold = 90', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.sendThresholdAlert('+15559876543', 'LIC_key123', 90, 90, 100, 90);

      expect(result).toBe(true);
      expect(mockTwilioClient.messages.create).toHaveBeenCalled();
    });

    it('sends SMS for threshold = 95', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.sendThresholdAlert('+15559876543', 'LIC_key123', 95, 95, 100, 95);

      expect(result).toBe(true);
    });

    it('sends SMS for threshold = 100', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.sendThresholdAlert('+15559876543', 'LIC_key123', 100, 100, 100, 100);

      expect(result).toBe(true);
    });

    it('formats message with alert-formatter and sends', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await service.sendThresholdAlert('+15559876543', 'LIC_abcdefgh', 95, 95, 100, 95);

      const callArgs = mockTwilioClient.messages.create.mock.calls[0][0];
      expect(callArgs.body).toContain('ALGO TRADER');
      expect(callArgs.body).toContain('URGENT');
      expect(callArgs.body).toContain('abcdefgh'); // last 8 of license key
      expect(callArgs.body).toContain('95/100');
      expect(callArgs.to).toBe('+15559876543');
    });
  });

  // ============================================================
  // checkDailyLimitRedis
  // ============================================================
  describe('checkDailyLimitRedis (private via send)', () => {
    beforeEach(() => {
      service.initialize();
      service.setRateLimit(0);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.setex.mockResolvedValue('OK');
      mockTwilioClient.messages.create.mockResolvedValue({ sid: 'SM_test' });
    });

    it('allows when no count exists', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null) // rate limit
        .mockResolvedValueOnce(null); // daily: null

      const result = await service.send({ to: '+15559876543', message: 'test' });
      expect(result).toBe(true);
    });

    it('allows when count < dailyLimit', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('5'); // 5 < 10

      const result = await service.send({ to: '+15559876543', message: 'test' });
      expect(result).toBe(true);
    });

    it('blocks when count >= dailyLimit', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('10'); // 10 >= 10

      const result = await service.send({ to: '+15559876543', message: 'test' });
      expect(result).toBe(false);
    });

    it('allows on redis error (fail-open)', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Redis error'));

      const result = await service.send({ to: '+15559876543', message: 'test' });
      expect(result).toBe(true);
    });
  });

  // ============================================================
  // incrementDailyCountRedis
  // ============================================================
  describe('incrementDailyCountRedis (private via send)', () => {
    beforeEach(() => {
      service.initialize();
      service.setRateLimit(0);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.setex.mockResolvedValue('OK');
      mockTwilioClient.messages.create.mockResolvedValue({ sid: 'SM_test' });
    });

    it('increments and sets TTL on success', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await service.send({ to: '+15559876543', message: 'test' });

      expect(mockRedis.incr).toHaveBeenCalledWith('algo:rate_limit:sms:daily:+15559876543');
      expect(mockRedis.expire).toHaveBeenCalledWith('algo:rate_limit:sms:daily:+15559876543', 86400);
    });

    it('swallows error and continues when redis increment fails', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockRedis.incr.mockRejectedValueOnce(new Error('Redis incr failed'));

      const result = await service.send({ to: '+15559876543', message: 'test' });

      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith('[SmsService] Redis daily count increment failed:', { error: expect.any(Error) });
    });
  });

  // ============================================================
  // applyRateLimitRedis
  // ============================================================
  describe('applyRateLimitRedis (private via send)', () => {
    beforeEach(() => {
      service.initialize();
      service.setRateLimit(0);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.setex.mockResolvedValue('OK');
      mockTwilioClient.messages.create.mockResolvedValue({ sid: 'SM_test' });
    });

    it('sets last_send key when no previous send', async () => {
      mockRedis.get.mockResolvedValueOnce(null); // no previous

      await service.send({ to: '+15559876543', message: 'test' });

      expect(mockRedis.setex).toHaveBeenCalledWith('algo:rate_limit:sms:last_send', 3600, expect.any(String));
    });

    it('waits when last send was recent', async () => {
      service.setRateLimit(100);
      const now = Date.now();
      mockRedis.get.mockResolvedValueOnce(String(now - 10)); // 10ms ago

      const start = Date.now();
      await service.send({ to: '+15559876543', message: 'test' });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(50); // waited ~90ms (100 - 10)
    });

    it('does not wait when last send was long ago', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValueOnce(String(now - 10000)); // 10 seconds ago

      const start = Date.now();
      await service.send({ to: '+15559876543', message: 'test' });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // no significant wait
    });

    it('swallows error and continues when redis fails', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis get failed'));

      const result = await service.send({ to: '+15559876543', message: 'test' });

      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith('[SmsService] Redis rate limiting failed:', { error: expect.any(Error) });
    });
  });

  // ============================================================
  // setRateLimit / setDailyLimit
  // ============================================================
  describe('setRateLimit / setDailyLimit', () => {
    it('sets custom rate limit delay', () => {
      service.setRateLimit(10000);
      // Can't directly test private field, but verify no error
    });

    it('sets custom daily limit', () => {
      service.setDailyLimit(5);
      // Can't directly test private field, but verify no error
    });
  });

  // ============================================================
  // getInstance singleton
  // ============================================================
  describe('getInstance singleton', () => {
    it('returns same instance', () => {
      const instance1 = SmsService.getInstance();
      const instance2 = SmsService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('returns exported smsService instance', () => {
      expect(smsService).toBeInstanceOf(SmsService);
    });
  });
});