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
  OnboardingStatus,
  SubscriberTier,
  TierOnboardingEvent,
  UtmParameters,
} from './lead-attribution-types';
import { LeadScoringEngine } from './lead-scoring-engine';
import {
  resolveNetworkSource,
  generateTierOnboardingSteps,
  createLeadTouchpoint,
  mergeLeadRecords,
  buildTierOnboardingEvent,
  applyOnboardingStepCompletion,
} from './lead-attribution-helpers';

export {
  resolveNetworkSource,
  generateTierOnboardingSteps,
  createLeadTouchpoint,
  mergeLeadRecords,
  buildTierOnboardingEvent,
  applyOnboardingStepCompletion,
};

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
    return resolveNetworkSource(source);
  }

  public recordTouchpoint(
    visitorId: string,
    utm: UtmParameters,
    options?: { ipAddress?: string; timestamp?: number }
  ): LeadAttributionRecord {
    const now = options?.timestamp ?? Date.now();
    const network = this.resolveNetwork(utm.utmSource);
    const touchpoint = createLeadTouchpoint(network, utm, now, options?.ipAddress);
    let leadId = this.visitorToLead.get(visitorId);

    if (leadId && this.records.has(leadId)) {
      const record = this.records.get(leadId)!;
      record.touchpoints.push(touchpoint);
      record.lastSeenAt = now;
      record.lastTouchNetwork = network;
      return record;
    }

    leadId = randomUUID();
    this.visitorToLead.set(visitorId, leadId);
    const record: LeadAttributionRecord = {
      leadId,
      visitorId,
      primaryNetwork: network,
      touchpoints: [touchpoint],
      firstSeenAt: now,
      lastSeenAt: now,
      firstTouchNetwork: network,
      lastTouchNetwork: network,
    };
    this.records.set(leadId, record);
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
        mergeLeadRecords(existingRecord, record);
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
    const onboardingEvent = buildTierOnboardingEvent(event);
    const steps = generateTierOnboardingSteps(event.newTier);
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
    return status ? applyOnboardingStepCompletion(status, stepId) : undefined;
  }

  public getOnboardingStatus(subscriberId: string): OnboardingStatus | undefined {
    return this.onboardingStatuses.get(subscriberId);
  }
}
