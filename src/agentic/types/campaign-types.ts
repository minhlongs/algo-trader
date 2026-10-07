/**
 * Campaign & Email Runner Types & Schemas
 *
 * Defines Zod schemas and TypeScript types for multi-tier drip campaigns,
 * delivery logging, subscriber tracking, and execution runner options.
 */

import { z } from 'zod';

export const UserTierSchema = z.enum(['FREE', 'BASIC', 'PREMIUM', 'MASTER']);
export type UserTier = z.infer<typeof UserTierSchema>;

export const CampaignStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const DeliveryStatusSchema = z.enum(['SENT', 'FAILED', 'SKIPPED', 'DRY_RUN']);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

export const CampaignEmailPayloadSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  htmlBody: z.string().min(1),
  textBody: z.string().optional(),
  tier: UserTierSchema.optional(),
  campaignId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CampaignEmailPayload = z.infer<typeof CampaignEmailPayloadSchema>;

export const CampaignSubscriberSchema = z.object({
  email: z.string().email(),
  tier: UserTierSchema,
  signupTimestamp: z.number().int().positive(),
  completedSteps: z.array(z.number().int().nonnegative()).default([]),
  tags: z.array(z.string()).default([]),
});
export type CampaignSubscriber = z.infer<typeof CampaignSubscriberSchema>;

export const CampaignStepSchema = z.object({
  stepNumber: z.number().int().nonnegative(),
  delayHours: z.number().nonnegative(),
  subject: z.string().min(1),
  htmlTemplate: z.string().min(1),
  textTemplate: z.string().optional(),
  targetTiers: z.array(UserTierSchema).default(['FREE', 'BASIC', 'PREMIUM', 'MASTER']),
});
export type CampaignStep = z.infer<typeof CampaignStepSchema>;

export const CampaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: CampaignStatusSchema.default('ACTIVE'),
  steps: z.array(CampaignStepSchema),
  targetTiers: z.array(UserTierSchema).default(['FREE', 'BASIC', 'PREMIUM', 'MASTER']),
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const DeliveryLogSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  recipientEmail: z.string().email(),
  stepNumber: z.number().int().nonnegative(),
  tier: UserTierSchema,
  status: DeliveryStatusSchema,
  timestamp: z.number(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});
export type DeliveryLog = z.infer<typeof DeliveryLogSchema>;

export const RunnerConfigSchema = z.object({
  maxRetries: z.number().int().min(0).default(3),
  initialBackoffMs: z.number().min(10).default(100),
  batchSize: z.number().int().min(1).default(10),
  rateLimitDelayMs: z.number().min(0).default(50),
  dryRun: z.boolean().default(false),
});
export type RunnerConfig = z.infer<typeof RunnerConfigSchema>;

export interface CampaignDispatchResult {
  campaignId: string;
  dispatchedAt: number;
  totalSubscribersEvaluated: number;
  emailsQueued: number;
  deliveryLogs: DeliveryLog[];
  dryRun: boolean;
}
