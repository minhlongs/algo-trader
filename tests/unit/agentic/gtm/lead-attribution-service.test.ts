import { describe, it, expect, beforeEach } from 'vitest';
import { LeadAttributionService } from '../../../../src/agentic/gtm/lead-attribution-service';

describe('LeadAttributionService Multi-Network Tracking & Onboarding', () => {
  let service: LeadAttributionService;

  beforeEach(() => {
    service = new LeadAttributionService();
  });

  it('correctly maps UTM sources to canonical networks', () => {
    expect(service.resolveNetwork('tiktok_ads')).toBe('TIKTOK');
    expect(service.resolveNetwork('shopee_live')).toBe('SHOPEE');
    expect(service.resolveNetwork('telegram_channel')).toBe('TELEGRAM');
    expect(service.resolveNetwork('tg_alpha')).toBe('TELEGRAM');
    expect(service.resolveNetwork('x.com_influencer')).toBe('TWITTER');
    expect(service.resolveNetwork('partner_revshare')).toBe('PARTNER');
    expect(service.resolveNetwork('google_search')).toBe('WEB');
    expect(service.resolveNetwork('')).toBe('DIRECT');
    expect(service.resolveNetwork(undefined)).toBe('DIRECT');
  });

  it('records initial touchpoint and links multiple touchpoints to the same visitor', () => {
    const record1 = service.recordTouchpoint('visitor-123', {
      utmSource: 'tiktok',
      utmCampaign: 'quant-summer',
      referralCode: 'TIKTOK50',
    });

    expect(record1.visitorId).toBe('visitor-123');
    expect(record1.primaryNetwork).toBe('TIKTOK');
    expect(record1.touchpoints.length).toBe(1);

    // Second touchpoint from telegram
    const record2 = service.recordTouchpoint('visitor-123', {
      utmSource: 'telegram',
      utmCampaign: 'vip-signals',
    });

    expect(record2.leadId).toBe(record1.leadId);
    expect(record2.touchpoints.length).toBe(2);
    expect(record2.firstTouchNetwork).toBe('TIKTOK');
    expect(record2.lastTouchNetwork).toBe('TELEGRAM');
  });

  it('links email to lead and retrieves lead score', () => {
    service.recordTouchpoint('visitor-456', {
      utmSource: 'shopee',
      referralCode: 'SHOPEE_PROMO',
    });

    const updated = service.linkEmailToLead('visitor-456', 'trader@propfirm.com');
    expect(updated?.email).toBe('trader@propfirm.com');

    const byEmail = service.getLeadByEmail('trader@propfirm.com');
    expect(byEmail).toBeDefined();
    expect(byEmail?.leadId).toBe(updated?.leadId);

    const score = service.getLeadScore(updated!.leadId);
    expect(score).toBeDefined();
    expect(score?.score).toBeGreaterThan(0);
  });

  it('merges multiple visitor IDs safely when linking to the same email', () => {
    service.recordTouchpoint('visitor-web', { utmSource: 'web', utmCampaign: 'search' });
    service.recordTouchpoint('visitor-tg', { utmSource: 'telegram', utmCampaign: 'tg-alert' });

    const lead1 = service.linkEmailToLead('visitor-web', 'same-user@domain.com');
    expect(lead1).toBeDefined();

    // Link second visitor with same email -> merges touchpoints
    const merged = service.linkEmailToLead('visitor-tg', 'same-user@domain.com');
    expect(merged?.leadId).toBe(lead1?.leadId);
    expect(merged?.touchpoints.length).toBe(2);
    expect(service.getLeadByEmail('same-user@domain.com')?.touchpoints.length).toBe(2);
  });

  it('handles subscriber tier onboarding and step progression', () => {
    const event = service.onboardSubscriber({
      subscriberId: 'sub-789',
      email: 'subscriber@gmail.com',
      previousTier: 'FREE',
      newTier: 'PREMIUM',
      paymentReference: 'PAY-ORD-987654321',
    });

    expect(event.verified).toBe(true);
    expect(event.onboardingSequenceId).toContain('seq-premium-');

    const status = service.getOnboardingStatus('sub-789');
    expect(status).toBeDefined();
    expect(status?.isFullyOnboarded).toBe(false);
    expect(status?.pendingSteps).toContain('setup-api-keys');

    // Complete steps
    const step1 = service.completeOnboardingStep('sub-789', 'setup-api-keys');
    expect(step1?.completedSteps).toContain('setup-api-keys');
    expect(step1?.pendingSteps).not.toContain('setup-api-keys');

    service.completeOnboardingStep('sub-789', 'configure-statarb');
    service.completeOnboardingStep('sub-789', 'enable-telegram-alerts');
    const finalStatus = service.completeOnboardingStep('sub-789', 'run-backtest');

    expect(finalStatus?.isFullyOnboarded).toBe(true);
  });

  it('marks unverified when payment reference is invalid or missing', () => {
    const event = service.onboardSubscriber({
      subscriberId: 'sub-bad',
      email: 'bad@test.com',
      previousTier: 'FREE',
      newTier: 'BASIC',
      paymentReference: 'short',
    });
    expect(event.verified).toBe(false);
  });
});
