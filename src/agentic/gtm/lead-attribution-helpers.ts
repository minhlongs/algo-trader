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

export function resolveNetworkSource(source?: string): LeadSourceNetwork {
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

export function generateTierOnboardingSteps(tier: SubscriberTier): string[] {
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

export function createLeadTouchpoint(
  network: LeadSourceNetwork,
  utm: UtmParameters,
  timestamp: number,
  ipAddress?: string
): LeadTouchpoint {
  return {
    touchpointId: randomUUID(),
    network,
    campaignId: utm.utmCampaign,
    referralCode: utm.referralCode,
    timestamp,
    ipAddress,
  };
}

export function mergeLeadRecords(
  target: LeadAttributionRecord,
  source: LeadAttributionRecord
): LeadAttributionRecord {
  target.touchpoints = target.touchpoints.concat(source.touchpoints);
  target.lastSeenAt = Math.max(target.lastSeenAt, source.lastSeenAt);
  target.lastTouchNetwork = source.lastTouchNetwork;
  return target;
}

export function buildTierOnboardingEvent(event: {
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

  return {
    subscriberId: event.subscriberId,
    email: event.email.toLowerCase().trim(),
    previousTier: event.previousTier,
    newTier: event.newTier,
    timestamp: event.timestamp ?? Date.now(),
    paymentReference: event.paymentReference,
    verified,
    onboardingSequenceId: `seq-${event.newTier.toLowerCase()}-${randomUUID().slice(0, 8)}`,
  };
}

export function applyOnboardingStepCompletion(
  status: OnboardingStatus,
  stepId: string
): OnboardingStatus {
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
