/**
 * Content Distribution Daemon & Multi-Channel Publisher
 *
 * Automates content discovery from marketing repositories, orchestrates
 * multi-channel syndication, and records immutable JSONL audit logs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../shared/utils/logger';
import { cashclawPath, appendJsonl } from '../../shared/persistence/file-store';
import type {
  PostMetadata,
  PublicationTarget,
  SyndicationRecord,
  ChannelPublisherAdapter,
  DistributionAuditRecord,
} from './distribution-types';
import { PostMetadataSchema } from './distribution-types';

export interface DistributionDaemonConfig {
  marketingDir?: string;
  auditLogPath?: string;
  publisher?: ChannelPublisherAdapter;
}

export class ContentDistributionDaemon {
  private readonly marketingDir: string;
  private readonly auditLogPath: string;
  private readonly publisher: ChannelPublisherAdapter;
  private readonly postQueue = new Map<string, PostMetadata>();
  private readonly syndicationHistory: SyndicationRecord[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(config: DistributionDaemonConfig = {}) {
    this.marketingDir = config.marketingDir ?? path.join(process.cwd(), 'docs', 'marketing');
    this.auditLogPath = config.auditLogPath ?? cashclawPath('distribution-audit.jsonl');
    this.publisher = config.publisher ?? (async (_post, target) => ({
      externalId: `${target.toLowerCase()}-${Date.now()}`,
      externalUrl: `https://cashclaw.cc/syndicated/${target.toLowerCase()}`,
    }));
  }

  public getQueue(): PostMetadata[] { return Array.from(this.postQueue.values()); }
  public getHistory(): SyndicationRecord[] { return [...this.syndicationHistory]; }
  public getAuditLogPath(): string { return this.auditLogPath; }

  public queuePost(post: PostMetadata): void {
    const validated = PostMetadataSchema.parse(post);
    this.postQueue.set(validated.id, validated);
  }

  public syncFromDirectory(dirOverride?: string): PostMetadata[] {
    const targetDir = dirOverride ?? this.marketingDir;
    if (!fs.existsSync(targetDir)) {
      logger.warn(`[ContentDaemon] Marketing dir not found: ${targetDir}`);
      return [];
    }

    const files = fs.readdirSync(targetDir).filter((f) => f.endsWith('.md'));
    const discovered: PostMetadata[] = [];

    for (const file of files) {
      try {
        const fullPath = path.join(targetDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        const slug = file.replace(/\.md$/, '');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : slug;

        const targetChannels: PublicationTarget[] = file.includes('twitter') ? ['TWITTER']
          : file.includes('discord') ? ['DISCORD']
          : file.includes('reddit') ? ['REDDIT']
          : file.includes('email') ? ['NEWSLETTER']
          : ['BLOG', 'TELEGRAM'];

        const post: PostMetadata = {
          id: `post-${slug}`,
          title,
          slug,
          content,
          tags: ['automated-syndication'],
          targetChannels,
          author: 'CashClaw Editorial',
          locale: 'bilingual',
          status: 'QUEUED',
          sourceFile: file,
        };

        this.queuePost(post);
        discovered.push(post);
      } catch (err) {
        logger.warn(`[ContentDaemon] Failed to read ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.emitAudit('SYNC_COMPLETED', { totalDiscovered: discovered.length });
    return discovered;
  }

  public async dispatchQueued(limit = 10): Promise<SyndicationRecord[]> {
    const queued = Array.from(this.postQueue.values()).filter((p) => p.status === 'QUEUED').slice(0, limit);
    const records: SyndicationRecord[] = [];

    for (const post of queued) {
      for (const channel of post.targetChannels) {
        const recordId = `syn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        try {
          const res = await this.publisher(post, channel);
          const record: SyndicationRecord = {
            id: recordId,
            postId: post.id,
            postSlug: post.slug,
            channel,
            status: 'SUCCESS',
            dispatchedAt: Date.now(),
            externalId: res.externalId,
            externalUrl: res.externalUrl,
          };
          records.push(record);
          this.syndicationHistory.push(record);
          this.emitAudit('DISPATCH_SUCCESS', { postId: post.id, channel });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const record: SyndicationRecord = {
            id: recordId,
            postId: post.id,
            postSlug: post.slug,
            channel,
            status: 'FAILED',
            dispatchedAt: Date.now(),
            error: errorMsg,
          };
          records.push(record);
          this.syndicationHistory.push(record);
          this.emitAudit('DISPATCH_FAILED', { postId: post.id, channel, error: errorMsg });
        }
      }
      post.status = 'PUBLISHED';
      post.publishedAt = Date.now();
    }
    return records;
  }

  private emitAudit(event: DistributionAuditRecord['event'], payload: Record<string, unknown>): void {
    const record: DistributionAuditRecord = { event, timestamp: Date.now(), payload };
    try {
      appendJsonl(this.auditLogPath, record);
    } catch (err) {
      logger.error(`[ContentDaemon] Failed to append audit log: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  public startDaemon(intervalMs = 60000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.syncFromDirectory();
      void this.dispatchQueued();
    }, intervalMs);
    this.timer.unref();
    this.emitAudit('DAEMON_STARTED', { intervalMs });
  }

  public stopDaemon(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.emitAudit('DAEMON_STOPPED', {});
    }
  }
}
