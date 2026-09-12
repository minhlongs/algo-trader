/**
 * Trial-to-Paid Email Drip Campaign Types & Interfaces
 */

export interface SchedulerState {
  subscribers: Record<string, {
    email: string;
    tier: string;
    subscribedAt: string;
    trialEndsAt: string;
    lastEmailDay: number;
    isActive: boolean;
  }>;
  autoRunPending: boolean;
}

export interface DripSubscriber {
  email: string;
  tenantId: string;
  tier: string;
  subscribedAt: string;
  trialEndsAt: string;
  daysSinceTrialStart: number;
  lastEmailDay: number;
  isActive: boolean;
}

export interface DripCampaignState {
  subscribers: DripSubscriber[];
  lastProcessedAt: string;
}

// Template map: day number -> email content generator
export type EmailTemplate = (sub: DripSubscriber) => { subject: string; body: string; html: string };
