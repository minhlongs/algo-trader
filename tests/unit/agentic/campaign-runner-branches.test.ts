import sgMail from '@sendgrid/mail';
import { describe, expect, it, vi } from 'vitest';
import { CampaignRunner, sanitizeSecret } from '../../../src/agentic/campaign-runner';
import type { CampaignEmailPayload } from '../../../src/agentic/types/campaign-types';

describe('CampaignRunner Branch Coverage', () => {
  it('sanitizes various secrets from log messages', () => {
    expect(sanitizeSecret('Error with SG.abcdefghijklmnopqrstuvwxyz1234567890 key')).toContain('[REDACTED_SENDGRID_KEY]');
    expect(sanitizeSecret('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz')).toContain('Bearer [REDACTED_TOKEN]');
    expect(sanitizeSecret('https://api.com?api_key=my-secret-123&env=prod')).toContain('api_key=[REDACTED]');
    expect(sanitizeSecret('Connection password=db-pass-secret')).toContain('password=[REDACTED]');
    expect(sanitizeSecret('Param secret=top-secret-val')).toContain('secret=[REDACTED]');
  });

  it('executes default sender with SendGrid when dryRun is false', async () => {
    const sendSpy = vi.spyOn(sgMail, 'send').mockResolvedValue([
      { headers: { 'x-message-id': 'header-msg-123' } } as unknown as any,
      {},
    ]);

    const prevKey = process.env.SENDGRID_API_KEY;
    try {
      process.env.SENDGRID_API_KEY = 'SG.123456789012345678901234567890';
      const runner = new CampaignRunner({ dryRun: false });

      const log = await runner.deliverSingle({
        to: 'real@example.com',
        subject: 'Real subject',
        htmlBody: '<p>Body</p>',
        textBody: 'Text body',
      });

      expect(log.status).toBe('SENT');
      expect(log.messageId).toBe('header-msg-123');
      expect(sendSpy).toHaveBeenCalled();
    } finally {
      if (prevKey) process.env.SENDGRID_API_KEY = prevKey;
      else delete process.env.SENDGRID_API_KEY;
      sendSpy.mockRestore();
    }
  });

  it('handles default sender when SendGrid returns no x-message-id header', async () => {
    const sendSpy = vi.spyOn(sgMail, 'send').mockResolvedValue([
      { headers: {} } as unknown as any,
      {},
    ]);

    const prevKey = process.env.SENDGRID_API_KEY;
    try {
      process.env.SENDGRID_API_KEY = 'SG.123456789012345678901234567890';
      const runner = new CampaignRunner({ dryRun: false });

      const log = await runner.deliverSingle({
        to: 'fallback@example.com',
        subject: 'Fallback subject',
        htmlBody: '<p>Fallback body</p>',
      });

      expect(log.status).toBe('SENT');
      expect(log.messageId).toMatch(/^sg-\d+/);
    } finally {
      if (prevKey) process.env.SENDGRID_API_KEY = prevKey;
      else delete process.env.SENDGRID_API_KEY;
      sendSpy.mockRestore();
    }
  });

  it('runs retry backoff progression through all retries on persistent error', async () => {
    vi.useFakeTimers();

    const sender = vi.fn().mockRejectedValue(new Error('Persistent 500 error'));
    const runner = new CampaignRunner(
      {
        dryRun: false,
        maxRetries: 2,
        initialBackoffMs: 50,
      },
      sender
    );

    const deliverPromise = runner.deliverSingle({
      to: 'backoff@example.com',
      subject: 'Backoff test',
      htmlBody: '<p>Backoff</p>',
    });

    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(100);

    const log = await deliverPromise;
    expect(log.status).toBe('FAILED');
    expect(sender).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('delivers batch with rate limiting delay between chunks', async () => {
    vi.useFakeTimers();

    const sender = vi.fn().mockResolvedValue({ messageId: 'msg-rate' });
    const runner = new CampaignRunner(
      {
        dryRun: false,
        batchSize: 1,
        rateLimitDelayMs: 100,
      },
      sender
    );

    const payloads: CampaignEmailPayload[] = [
      { to: '1@example.com', subject: '1', htmlBody: '1' },
      { to: '2@example.com', subject: '2', htmlBody: '2' },
    ];

    const batchPromise = runner.deliverBatch(payloads);
    await vi.advanceTimersByTimeAsync(100);

    const logs = await batchPromise;
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.status === 'SENT')).toBe(true);

    vi.useRealTimers();
  });
});
