import { describe, it, expect, vi } from 'vitest';
import { CampaignRunner } from '../../../src/agentic/campaign-runner';

describe('CampaignRunner', () => {
  it('delivers dry-run payload without calling real sender', async () => {
    const sender = vi.fn();
    const runner = new CampaignRunner({ dryRun: true }, sender);

    const log = await runner.deliverSingle({
      to: 'tester@example.com',
      subject: 'Welcome',
      htmlBody: '<p>Hi</p>',
      campaignId: 'welcome-flow',
      tier: 'BASIC',
    });

    expect(log.status).toBe('DRY_RUN');
    expect(log.messageId).toContain('dry-');
    expect(sender).not.toHaveBeenCalled();
  });

  it('retries on transient failure and returns SENT upon recovery', async () => {
    const sender = vi
      .fn()
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockResolvedValueOnce({ messageId: 'msg-success-123' });

    const runner = new CampaignRunner(
      {
        dryRun: false,
        maxRetries: 2,
        initialBackoffMs: 10,
      },
      sender
    );

    const log = await runner.deliverSingle({
      to: 'retry@example.com',
      subject: 'Retrying',
      htmlBody: '<p>Content</p>',
      campaignId: 'drip-2',
      tier: 'PREMIUM',
    });

    expect(log.status).toBe('SENT');
    expect(log.messageId).toBe('msg-success-123');
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it('marks FAILED after exhausting max retries', async () => {
    const sender = vi.fn().mockRejectedValue(new Error('Account suspended'));
    const runner = new CampaignRunner(
      {
        dryRun: false,
        maxRetries: 1,
        initialBackoffMs: 10,
      },
      sender
    );

    const log = await runner.deliverSingle({
      to: 'fail@example.com',
      subject: 'Failed',
      htmlBody: '<p>Content</p>',
      campaignId: 'drip-3',
      tier: 'MASTER',
    });

    expect(log.status).toBe('FAILED');
    expect(log.error).toContain('Account suspended');
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it('delivers batch of payloads with rate limiting delay', async () => {
    const sender = vi.fn().mockResolvedValue({ messageId: 'batch-msg' });
    const runner = new CampaignRunner(
      {
        dryRun: false,
        batchSize: 2,
        rateLimitDelayMs: 10,
      },
      sender
    );

    const payloads = [1, 2, 3].map((i) => ({
      to: `user${i}@example.com`,
      subject: `Batch ${i}`,
      htmlBody: `<p>${i}</p>`,
      campaignId: 'batch-campaign',
      tier: 'BASIC' as const,
    }));

    const results = await runner.deliverBatch(payloads);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'SENT')).toBe(true);
    expect(sender).toHaveBeenCalledTimes(3);
  });

  it('uses default dry-run sender when no sender is provided', async () => {
    const runner = new CampaignRunner({ dryRun: true });
    expect(runner.getConfig().dryRun).toBe(true);

    const log = await runner.deliverSingle({
      to: 'default-sender@example.com',
      subject: 'Default',
      htmlBody: '<p>Default</p>',
    });

    expect(log.status).toBe('DRY_RUN');
    expect(log.tier).toBe('FREE');
    expect(log.campaignId).toBe('standalone');
    expect(log.stepNumber).toBe(0);
  });

  it('handles non-Error rejection and extracts stepNumber from metadata', async () => {
    const sender = vi.fn().mockRejectedValue('String network error');
    const runner = new CampaignRunner(
      {
        dryRun: false,
        maxRetries: 0,
      },
      sender
    );

    const log = await runner.deliverSingle({
      to: 'step@example.com',
      subject: 'Step Meta',
      htmlBody: '<p>Meta</p>',
      metadata: { stepNumber: 3 },
    });

    expect(log.status).toBe('FAILED');
    expect(log.error).toBe('String network error');
    expect(log.stepNumber).toBe(3);
  });
});
