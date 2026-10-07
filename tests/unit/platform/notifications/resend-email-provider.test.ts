/**
 * Resend Email Provider Adapter — Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createResendSender,
  sanitizeResendSecret,
} from '../../../../src/platform/notifications/resend-email-provider';
import type { CampaignEmailPayload } from '../../../../src/agentic/types/campaign-types';

describe('Resend Email Provider Adapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('sanitizeResendSecret', () => {
    it('masks resend API keys', () => {
      const input = 'Failed with key re_1234567890abcdef1234567890';
      expect(sanitizeResendSecret(input)).toContain('[REDACTED_RESEND_KEY]');
      expect(sanitizeResendSecret(input)).not.toContain('re_1234567890abcdef1234567890');
    });

    it('masks bearer tokens and secrets', () => {
      const input = 'Bearer re_my_super_secret_token_12345678 and api_key=supersecret';
      const sanitized = sanitizeResendSecret(input);
      expect(sanitized).toContain('Bearer [REDACTED_TOKEN]');
      expect(sanitized).toContain('api_key=[REDACTED]');
    });
  });

  describe('createResendSender', () => {
    const payload: CampaignEmailPayload = {
      to: 'trader@example.com',
      subject: 'Welcome to Algorithmic Signals',
      htmlBody: '<h1>Your Pro Tier is Activated</h1>',
      textBody: 'Your Pro Tier is Activated',
    };

    it('throws immediately when API key is missing', async () => {
      delete process.env.RESEND_API_KEY;
      const sender = createResendSender();
      await expect(sender(payload)).rejects.toThrow('Resend API key is missing');
    });

    it('successfully delivers email and extracts message ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'email_msg_123456789' }),
      });

      const sender = createResendSender({
        apiKey: 're_valid_api_key_test_123456789',
        fromEmail: 'alerts@algo-trader.com',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await sender(payload);

      expect(result).toEqual({ messageId: 'email_msg_123456789' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, requestInit] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.resend.com/emails');
      expect(requestInit.headers.Authorization).toBe('Bearer re_valid_api_key_test_123456789');
      const body = JSON.parse(requestInit.body);
      expect(body.to).toEqual(['trader@example.com']);
      expect(body.from).toBe('alerts@algo-trader.com');
      expect(body.subject).toBe('Welcome to Algorithmic Signals');
    });

    it('retries on 429 rate limit response', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'retry-after': '1' }),
          text: async () => 'Rate limit exceeded',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: 'email_msg_after_retry' }),
        });

      const sender = createResendSender({
        apiKey: 're_valid_api_key_test_123456789',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await sender(payload);
      expect(result).toEqual({ messageId: 'email_msg_after_retry' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws sanitized error when non-200 and retries exhausted', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Error with key re_1234567890abcdef1234567890: Invalid domain',
      });

      const sender = createResendSender({
        apiKey: 're_valid_api_key_test_123456789',
        fetchFn: mockFetch as unknown as typeof fetch,
        maxRetries: 1,
      });

      await expect(sender(payload)).rejects.toThrow(
        'Resend API error (400): Error with key [REDACTED_RESEND_KEY]: Invalid domain'
      );
    });

    it('throws error when response json has no id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const sender = createResendSender({
        apiKey: 're_valid_api_key_test_123456789',
        fetchFn: mockFetch as unknown as typeof fetch,
        maxRetries: 0,
      });

      await expect(sender(payload)).rejects.toThrow(
        'Resend API returned response without message ID'
      );
    });
  });
});
