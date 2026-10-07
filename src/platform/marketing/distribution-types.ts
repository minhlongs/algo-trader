/**
 * Content Distribution & Multi-Channel Syndication Types
 *
 * Defines Zod schemas and TypeScript interfaces for publication targets,
 * post metadata, syndication dispatch records, and audit events.
 */

import { z } from 'zod';

export const PublicationTargetSchema = z.enum([
  'BLOG',
  'TELEGRAM',
  'TWITTER',
  'DISCORD',
  'REDDIT',
  'NEWSLETTER',
]);
export type PublicationTarget = z.infer<typeof PublicationTargetSchema>;

export const PostStatusSchema = z.enum([
  'DRAFT',
  'QUEUED',
  'PUBLISHED',
  'FAILED',
  'ARCHIVED',
]);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const PostMetadataSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  slug: z.string().min(1),
  summary: z.string().optional(),
  content: z.string(),
  tags: z.array(z.string()).default([]),
  targetChannels: z.array(PublicationTargetSchema).default(['BLOG', 'TELEGRAM']),
  author: z.string().default('CashClaw AI Editorial'),
  locale: z.enum(['vi', 'en', 'bilingual']).default('bilingual'),
  publishedAt: z.number().optional(),
  status: PostStatusSchema.default('QUEUED'),
  sourceFile: z.string().optional(),
});
export type PostMetadata = z.infer<typeof PostMetadataSchema>;

export const SyndicationStatusSchema = z.enum([
  'PENDING',
  'SUCCESS',
  'FAILED',
  'SKIPPED',
]);
export type SyndicationStatus = z.infer<typeof SyndicationStatusSchema>;

export const SyndicationRecordSchema = z.object({
  id: z.string(),
  postId: z.string(),
  postSlug: z.string(),
  channel: PublicationTargetSchema,
  status: SyndicationStatusSchema,
  dispatchedAt: z.number(),
  externalUrl: z.string().optional(),
  externalId: z.string().optional(),
  error: z.string().optional(),
});
export type SyndicationRecord = z.infer<typeof SyndicationRecordSchema>;

export const DistributionAuditRecordSchema = z.object({
  event: z.enum([
    'SYNC_COMPLETED',
    'DISPATCH_SUCCESS',
    'DISPATCH_FAILED',
    'DAEMON_STARTED',
    'DAEMON_STOPPED',
  ]),
  timestamp: z.number(),
  payload: z.record(z.string(), z.unknown()),
});
export type DistributionAuditRecord = z.infer<typeof DistributionAuditRecordSchema>;

export type ChannelPublisherAdapter = (
  post: PostMetadata,
  target: PublicationTarget
) => Promise<{ externalId?: string; externalUrl?: string }>;
