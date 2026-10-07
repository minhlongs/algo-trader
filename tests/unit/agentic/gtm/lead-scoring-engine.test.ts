import { describe, it, expect } from 'vitest';
import { LeadScoringEngine } from '../../../../src/agentic/gtm/lead-scoring-engine';
import type { LeadAttributionRecord } from '../../../../src/agentic/gtm/lead-attribution-types';

describe('LeadScoringEngine Behavioral Evaluation', () => {
  const engine = new LeadScoringEngine();

  it('scores fresh lead with no email and 1 touchpoint as COLD', () => {
    const record: LeadAttributionRecord = {
      leadId: 'l1',
      visitorId: 'v1',
      primaryNetwork: 'DIRECT',
      touchpoints: [
        {
          touchpointId: 'tp1',
          network: 'DIRECT',
          timestamp: Date.now(),
        },
      ],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      firstTouchNetwork: 'DIRECT',
      lastTouchNetwork: 'DIRECT',
    };

    const result = engine.scoreLead(record);
    expect(result.score).toBeLessThan(35);
    expect(result.qualification).toBe('COLD');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('awards bonuses for referral code, email presence, and recency', () => {
    const record: LeadAttributionRecord = {
      leadId: 'l2',
      visitorId: 'v2',
      email: 'trader@algo-fund.com',
      primaryNetwork: 'TELEGRAM',
      touchpoints: [
        {
          touchpointId: 'tp1',
          network: 'TELEGRAM',
          referralCode: 'ALPHA2026',
          timestamp: Date.now() - 3600 * 1000,
        },
      ],
      firstSeenAt: Date.now() - 3600 * 1000,
      lastSeenAt: Date.now() - 3600 * 1000,
      firstTouchNetwork: 'TELEGRAM',
      lastTouchNetwork: 'TELEGRAM',
    };

    const result = engine.scoreLead(record);
    // touchpoint: 8 + referral: 25 + email: 20 + recency: 20 = 73
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.qualification).toBe('HOT');
  });

  it('qualifies highly engaged cross-network lead as QUALIFIED', () => {
    const record: LeadAttributionRecord = {
      leadId: 'l3',
      visitorId: 'v3',
      email: 'institutional@hedgefund.io',
      primaryNetwork: 'TIKTOK',
      touchpoints: [
        { touchpointId: 'tp1', network: 'TIKTOK', referralCode: 'VIP99', timestamp: Date.now() },
        { touchpointId: 'tp2', network: 'SHOPEE', timestamp: Date.now() },
        { touchpointId: 'tp3', network: 'TELEGRAM', timestamp: Date.now() },
        { touchpointId: 'tp4', network: 'TWITTER', timestamp: Date.now() },
      ],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      firstTouchNetwork: 'TIKTOK',
      lastTouchNetwork: 'TWITTER',
    };

    const result = engine.scoreLead(record);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.qualification).toBe('QUALIFIED');
  });

  it('applies linear recency decay for older inactive leads', () => {
    const now = Date.now();
    const oldTimestamp = now - 20 * 24 * 3600 * 1000; // 20 days ago

    const record: LeadAttributionRecord = {
      leadId: 'l4',
      visitorId: 'v4',
      primaryNetwork: 'DIRECT',
      touchpoints: [
        { touchpointId: 'tp1', network: 'DIRECT', timestamp: oldTimestamp },
      ],
      firstSeenAt: oldTimestamp,
      lastSeenAt: oldTimestamp,
      firstTouchNetwork: 'DIRECT',
      lastTouchNetwork: 'DIRECT',
    };

    const result = engine.scoreLead(record, now);
    expect(result.score).toBeLessThan(30);
    expect(result.qualification).toBe('COLD');
  });
});
