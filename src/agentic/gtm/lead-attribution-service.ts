/**
 * Autonomous GTM Lead Attribution Service
 *
 * Tracks multi-network visitor journeys, reconciles touchpoints, scores leads,
 * and handles subscriber tier onboarding transitions.
 *
 * @module agentic/gtm/lead-attribution-service
 */

import { randomUUID } from 'crypto';
import type {
  LeadAttributionRecord,
  LeadSourceNetwork,
  LeadTouchpoint,
  OnboardingStatus,
  SubscriberTier,
  TierOnboardingEvent,
  UtmParameters,
} from './lead-attribution-types';
import { LeadScoringEngine } from './lead-scoring-engine';

export class LeadAttributionService {
  private readonly records = new Map<string, LeadAttributionRecord>();
  private readonly visitorToLead = new Map<string, string>();
  private readonly emailToLead = new Map<string, string>();
  private readonly onboardingStatuses = new Map<string, OnboardingStatus>();
  private readonly scoringEngine: LeadScoringEngine;

  constructor(scoringEngine?: LeadScoringEngine) {
    this.scoringEngine = scoringEngine ?? new LeadScoringEngine();
  }

  public resolveNetwork(source?: string): LeadSourceNetwork {
    if (!source) return 'DIRECT';
    const s = source.toUpperCase();
    if (s.includes('TIKTOK')) return 'TIKTOK';
    if (s.includes('SHOPEE')) return 'SHOPEE';
    if (s.includes('TELEGRAM') || s.includes('TG')) return 'TELEGRAM';
    if (s.includes('TWITTER') || s.includes('X.COM')) return 'TWITTER';
    if (s.includes('PARTNER') || s.includes('AFFILIATE')) return 'PARTNER';
    if (s.includes('GOOGLE') || s.includes('FACEBOOK') || s.includes('WEB')) return 'WEB';
    return 'DIRECT';
  }

  public recordTouchpoint(
    visitorId: string,
    utm: UtmParameters,
    options?: { ipAddress?: string; timestamp?: number }
  ): LeadAttributionRecord {
    const now = options?.timestamp ?? Date.now();
    const network = this.resolveNetwork(utm.utmSource);
    let leadId = this.visitorToLead.get(visitorId);
    let record: LeadAttributionRecord;

    const touchpoint: LeadTouchpoint = {
      touchpointId: randomUUID(),
      network,
      campaignId: utm.utmCampaign,
      referralCode: utm.referralCode,
      timestamp: now,
      ipAddress: options?.ipAddress,
    };

    if (leadId && this.records.has(leadId)) {
      record = this.records.get(leadId)!;
      record.touchpoints.push(touchpoint);
      record.lastSeenAt = now;
      record.lastTouchNetwork = network;
    } else {
      leadId = randomUUID();
      this.visitorToLead.set(visitorId, leadId);
      record = {
        leadId, visitorId, primaryNetwork: network,
        touchpoints: [touchpoint], firstSeenAt: now, lastSeenAt: now,
        firstTouchNetwork: network, lastTouchNetwork: network,
      };
      this.records.set(leadId, record);
    }

    return record;
  }

  public linkEmailToLead(visitorId: string, email: string): LeadAttributionRecord | undefined {
    const leadId = this.visitorToLead.get(visitorId);
    if (!leadId) return undefined;
    const record = this.records.get(leadId);
    if (!record) return undefined;

    const normalizedEmail = email.toLowerCase().trim();
    const existingLeadId = this.emailToLead.get(normalizedEmail);

    if (existingLeadId && existingLeadId !== leadId) {
      const existingRecord = this.records.get(existingLeadId);
      if (existingRecord) {
        existingRecord.touchpoints = existingRecord.touchpoints.concat(record.touchpoints);
        existingRecord.lastSeenAt = Math.max(existingRecord.lastSeenAt, record.lastSeenAt);
        existingRecord.lastTouchNetwork = record.lastTouchNetwork;
        this.records.delete(leadId);
        this.visitorToLead.set(visitorId, existingLeadId);
        return existingRecord;
      }
    }

    record.email = normalizedEmail;
    this.emailToLead.set(normalizedEmail, leadId);
    return record;
  }

  public getLeadById(leadId: string): LeadAttributionRecord | undefined {
    return this.records.get(leadId);
  }

  public getLeadByEmail(email: string): LeadAttributionRecord | undefined {
    const leadId = this.emailToLead.get(email.toLowerCase().trim());
    return leadId ? this.records.get(leadId) : undefined;
  }

  public getLeadScore(leadId: string, now?: number) {
    const record = this.records.get(leadId);
    if (!record) return undefined;
    return this.scoringEngine.scoreLead(record, now);
  }

  public onboardSubscriber(event: {
    subscriberId: string;
    email: string;
    previousTier: SubscriberTier;
    newTier: SubscriberTier;
    paymentReference: string;
    timestamp?: number;
  }): TierOnboardingEvent {
    const verified = Boolean(
      event.paymentReference &&
      event.paymentReference.length >= 8 &&
      event.email.includes('@') &&
      event.newTier !== 'FREE'
    );

    const onboardingEvent: TierOnboardingEvent = {
      subscriberId: event.subscriberId,
      email: event.email.toLowerCase().trim(),
      previousTier: event.previousTier,
      newTier: event.newTier,
      timestamp: event.timestamp ?? Date.now(),
      paymentReference: event.paymentReference,
      verified,
      onboardingSequenceId: `seq-${event.newTier.toLowerCase()}-${randomUUID().slice(0, 8)}`,
    };

    const steps = this.generateOnboardingSteps(event.newTier);
    this.onboardingStatuses.set(event.subscriberId, {
      subscriberId: event.subscriberId,
      tier: event.newTier,
      completedSteps: [],
      pendingSteps: steps,
      isFullyOnboarded: steps.length === 0,
    });

    return onboardingEvent;
  }

  public completeOnboardingStep(subscriberId: string, stepId: string): OnboardingStatus | undefined {
    const status = this.onboardingStatuses.get(subscriberId);
    if (!status) return undefined;

    const idx = status.pendingSteps.indexOf(stepId);
    if (idx !== -1) {
      status.pendingSteps.splice(idx, 1);
      if (!status.completedSteps.includes(stepId)) {
        status.completedSteps.push(stepId);
      }
      status.isFullyOnboarded = status.pendingSteps.length === 0;
    }

    return status;
  }

  public getOnboardingStatus(subscriberId: string): OnboardingStatus | undefined {
    return this.onboardingStatuses.get(subscriberId);
  }

  private generateOnboardingSteps(tier: SubscriberTier): string[] {
    switch (tier) {
      case 'BASIC':
        return ['setup-api-keys', 'select-trading-pair', 'enable-paper-mode'];
      case 'PREMIUM':
        return ['setup-api-keys', 'configure-statarb', 'enable-telegram-alerts', 'run-backtest'];
      case 'ENTERPRISE':
      case 'MASTER':
        return ['dedicated-edge-routing', 'risk-cockpit-setup', 'multi-region-failover', 'vip-consultation'];
      case 'FREE':
      default:
        return ['verify-email'];
    }
  }
}
