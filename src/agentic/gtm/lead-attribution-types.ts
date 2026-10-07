/**
 * Autonomous GTM & Marketing Engine Type Definitions
 *
 * @module agentic/gtm/lead-attribution-types
 */

export type LeadSourceNetwork =
  | 'TIKTOK'
  | 'SHOPEE'
  | 'TELEGRAM'
  | 'TWITTER'
  | 'WEB'
  | 'DIRECT'
  | 'PARTNER';

export type LeadQualification = 'COLD' | 'WARM' | 'HOT' | 'QUALIFIED';

export type SubscriberTier = 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE' | 'MASTER';

export interface UtmParameters {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referralCode?: string;
}

export interface LeadTouchpoint {
  touchpointId: string;
  network: LeadSourceNetwork;
  campaignId?: string;
  referralCode?: string;
  timestamp: number;
  ipAddress?: string;
}

export interface LeadAttributionRecord {
  leadId: string;
  visitorId: string;
  email?: string;
  primaryNetwork: LeadSourceNetwork;
  touchpoints: LeadTouchpoint[];
  firstSeenAt: number;
  lastSeenAt: number;
  firstTouchNetwork: LeadSourceNetwork;
  lastTouchNetwork: LeadSourceNetwork;
}

export interface LeadScoreResult {
  leadId: string;
  score: number; // 0 to 100
  qualification: LeadQualification;
  reasons: string[];
  evaluatedAt: number;
}

export interface TierOnboardingEvent {
  subscriberId: string;
  email: string;
  previousTier: SubscriberTier;
  newTier: SubscriberTier;
  timestamp: number;
  paymentReference: string;
  verified: boolean;
  onboardingSequenceId: string;
}

export interface OnboardingStatus {
  subscriberId: string;
  tier: SubscriberTier;
  completedSteps: string[];
  pendingSteps: string[];
  isFullyOnboarded: boolean;
}
