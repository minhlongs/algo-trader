/**
 * Autonomous Campaign Dispatcher & Campaign Runner Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignRunner, sanitizeSecret } from '../../../src/agentic/campaign-runner';
import { CampaignDispatcher } from '../../../src/agentic/campaign-dispatcher';
import type {
  Campaign,
  CampaignSubscriber,
  CampaignEmailPayload,
} from '../../../src/agentic/types/campaign-types';

describe('CampaignRunner & Secret Sanitization', () => {
  it('sanitizes SendGrid keys, bearer tokens, and secrets', () => {
    const raw = 'Error with key SG.1234567890abcdef1234567890 and Bearer eyJhbGciOiJIUzI1Ni... and apiKey=supersecret123';
    const sanitized = sanitizeSecret(raw);
    expect(sanitized).not.toContain('SG.1234567890abcdef1234567890');
    expect(sanitized).not.toContain('supersecret123');
    expect(sanitized).toContain('[REDACTED_SENDGRID_KEY]');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('delivers simulated message in dry-run mode', async () => {
    const runner = new CampaignRunner({ dryRun: true });
    const payload: CampaignEmailPayload = {
      to: 'trader@example.com',
      subject: 'Welcome to Algo Trader',
      htmlBody: '<p>Welcome</p>',
      tier: 'BASIC',
    };

    const result = await runner.deliverSingle(payload);
    expect(result.status).toBe('DRY_RUN');
    expect(result.recipientEmail).toBe('trader@example.com');
    expect(result.messageId).toBeDefined();
  });

  it('executes custom sender and delivers successfully', async () => {
    const sender = vi.fn().mockResolvedValue({ messageId: 'msg-custom-123' });
    const runner = new CampaignRunner({ dryRun: false }, sender);
    const payload: CampaignEmailPayload = {
      to: 'vip@example.com',
      subject: 'Market Update',
      htmlBody: '<h1>Alpha</h1>',
      tier: 'PREMIUM',
    };

    const result = await runner.deliverSingle(payload);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('SENT');
    expect(result.messageId).toBe('msg-custom-123');
  });

  it('retries with exponential backoff on transient failure and recovers', async () => {
    let attempts = 0;
    const sender = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Connection reset SG.abcdef123456789012345678');
      }
      return { messageId: 'msg-recovered' };
    });

    const runner = new CampaignRunner({ dryRun: false, maxRetries: 2, initialBackoffMs: 10 }, sender);
    const result = await runner.deliverSingle({
      to: 'retry@example.com',
      subject: 'Retry Test',
      htmlBody: 'Testing retry',
    });

    expect(attempts).toBe(2);
    expect(result.status).toBe('SENT');
    expect(result.messageId).toBe('msg-recovered');
  });

  it('exhausts retries and returns FAILED with sanitized error', async () => {
    const sender = vi.fn().mockRejectedValue(new Error('Fatal API failure SG.abcdef123456789012345678'));
    const runner = new CampaignRunner({ dryRun: false, maxRetries: 1, initialBackoffMs: 10 }, sender);

    const result = await runner.deliverSingle({
      to: 'fail@example.com',
      subject: 'Fail Test',
      htmlBody: 'Testing failure',
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain('SG.abcdef123456789012345678');
    expect(result.error).toContain('[REDACTED_SENDGRID_KEY]');
  });

  it('processes batch deliveries respecting batchSize', async () => {
    const sender = vi.fn().mockResolvedValue({ messageId: 'batch-ok' });
    const runner = new CampaignRunner({ dryRun: false, batchSize: 2, rateLimitDelayMs: 5 }, sender);

    const payloads: CampaignEmailPayload[] = [
      { to: 'sub1@example.com', subject: '1', htmlBody: 'b1' },
      { to: 'sub2@example.com', subject: '2', htmlBody: 'b2' },
      { to: 'sub3@example.com', subject: '3', htmlBody: 'b3' },
    ];

    const results = await runner.deliverBatch(payloads);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'SENT')).toBe(true);
  });
});

describe('CampaignDispatcher', () => {
  let dispatcher: CampaignDispatcher;
  const mockCampaign: Campaign = {
    id: 'onboarding-drip',
    name: 'New Trader Onboarding',
    status: 'ACTIVE',
    targetTiers: ['FREE', 'BASIC', 'PREMIUM', 'MASTER'],
    steps: [
      {
        stepNumber: 0,
        delayHours: 0,
        subject: 'Welcome {{email}} to {{campaignName}}',
        htmlTemplate: '<p>Hi {{tier}} trader!</p>',
        targetTiers: ['FREE', 'BASIC', 'PREMIUM', 'MASTER'],
      },
      {
        stepNumber: 1,
        delayHours: 24,
        subject: 'Day 1: Getting Started',
        htmlTemplate: '<p>Setup your account</p>',
        targetTiers: ['BASIC', 'PREMIUM'],
      },
    ],
  };

  beforeEach(() => {
    const runner = new CampaignRunner({ dryRun: true });
    dispatcher = new CampaignDispatcher(runner);
    dispatcher.registerCampaign(mockCampaign);
  });

  it('registers campaign and validates schema', () => {
    const retrieved = dispatcher.getCampaign('onboarding-drip');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('New Trader Onboarding');
  });

  it('rejects invalid subscriber registration', () => {
    expect(() => {
      dispatcher.registerSubscriber({
        email: 'invalid-email',
        tier: 'BASIC',
        signupTimestamp: Date.now(),
        completedSteps: [],
        tags: [],
      });
    }).toThrow();
  });

  it('dispatches step 0 immediately for newly signed up subscriber', async () => {
    const now = Date.now();
    const sub: CampaignSubscriber = {
      email: 'alex@example.com',
      tier: 'BASIC',
      signupTimestamp: now,
      completedSteps: [],
      tags: ['new-user'],
    };
    dispatcher.registerSubscriber(sub);

    const res = await dispatcher.dispatchCampaign('onboarding-drip', { now, dryRun: true });
    expect(res.totalSubscribersEvaluated).toBe(1);
    expect(res.emailsQueued).toBe(1);
    expect(res.deliveryLogs).toHaveLength(1);
    expect(res.deliveryLogs[0].status).toBe('DRY_RUN');

    // Subscriber completedSteps should now include step 0
    const updatedSub = dispatcher.getSubscriber('alex@example.com');
    expect(updatedSub?.completedSteps).toContain(0);
  });

  it('respects delayHours and does not dispatch step 1 prematurely', async () => {
    const signup = 1000000000;
    const sub: CampaignSubscriber = {
      email: 'tim@example.com',
      tier: 'BASIC',
      signupTimestamp: signup,
      completedSteps: [0],
      tags: [],
    };
    dispatcher.registerSubscriber(sub);

    // Only 10 hours elapsed, step 1 requires 24 hours
    const now = signup + 10 * 3600 * 1000;
    const res = await dispatcher.dispatchCampaign('onboarding-drip', { now, dryRun: true });
    expect(res.emailsQueued).toBe(0);

    // Advance time past 24 hours
    const future = signup + 25 * 3600 * 1000;
    const resFuture = await dispatcher.dispatchCampaign('onboarding-drip', { now: future, dryRun: true });
    expect(resFuture.emailsQueued).toBe(1);
    expect(dispatcher.getSubscriber('tim@example.com')?.completedSteps).toContain(1);
  });

  it('skips dispatch if campaign is PAUSED', async () => {
    const pausedCampaign: Campaign = {
      ...mockCampaign,
      id: 'paused-camp',
      status: 'PAUSED',
    };
    dispatcher.registerCampaign(pausedCampaign);
    dispatcher.registerSubscriber({
      email: 'skip@example.com',
      tier: 'BASIC',
      signupTimestamp: Date.now(),
      completedSteps: [],
      tags: [],
    });

    const res = await dispatcher.dispatchCampaign('paused-camp');
    expect(res.emailsQueued).toBe(0);
    expect(res.deliveryLogs).toHaveLength(0);
  });

  it('dispatches across all active campaigns via dispatchAllActive', async () => {
    dispatcher.registerSubscriber({
      email: 'active@example.com',
      tier: 'MASTER',
      signupTimestamp: Date.now(),
      completedSteps: [],
      tags: [],
    });

    const results = await dispatcher.dispatchAllActive({ dryRun: true });
    expect(results).toHaveLength(1);
    expect(results[0].campaignId).toBe('onboarding-drip');
    expect(results[0].emailsQueued).toBe(1);
  });
});
