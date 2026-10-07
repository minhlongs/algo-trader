/**
 * Campaign Runner - Rate-limited Email Delivery & Exponential Backoff
 *
 * Executes email batch delivery with exponential retry backoff,
 * dry-run support, secret masking, and structured audit logs.
 */

import sgMail from '@sendgrid/mail';
import { logger } from '../shared/utils/logger';
import type {
  CampaignEmailPayload,
  DeliveryLog,
  RunnerConfig,
  UserTier,
} from './types/campaign-types';
import { RunnerConfigSchema } from './types/campaign-types';

export type EmailSenderFn = (payload: CampaignEmailPayload) => Promise<{ messageId: string }>;

export function sanitizeSecret(input: string): string {
  return input
    .replace(/SG\.[a-zA-Z0-9_\-.]{20,}/g, '[REDACTED_SENDGRID_KEY]')
    .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/(api[-_]?key|password|secret)=([^&\s]+)/gi, '$1=[REDACTED]');
}

export class CampaignRunner {
  private readonly config: RunnerConfig;
  private readonly sender: EmailSenderFn;

  constructor(config: Partial<RunnerConfig> = {}, customSender?: EmailSenderFn) {
    this.config = RunnerConfigSchema.parse({
      ...config,
      dryRun: config.dryRun ?? (process.env.SENDGRID_DRY_RUN === 'true' || !process.env.SENDGRID_API_KEY),
    });

    if (customSender) {
      this.sender = customSender;
    } else {
      const apiKey = process.env.SENDGRID_API_KEY || '';
      const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'no-reply@algo-trader.com';
      if (apiKey && !this.config.dryRun) {
        sgMail.setApiKey(apiKey);
      }
      this.sender = async (payload: CampaignEmailPayload) => {
        if (this.config.dryRun) {
          return { messageId: `dry-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
        }
        const [response] = await sgMail.send({
          to: payload.to,
          from: fromEmail,
          subject: payload.subject,
          html: payload.htmlBody,
          text: payload.textBody || payload.subject,
        });
        const msgId = response?.headers?.['x-message-id'] as string | undefined;
        return { messageId: msgId ?? `sg-${Date.now()}` };
      };
    }
  }

  public getConfig(): RunnerConfig {
    return { ...this.config };
  }

  public async deliverSingle(payload: CampaignEmailPayload): Promise<DeliveryLog> {
    const tier: UserTier = payload.tier ?? 'FREE';
    const stepNumber = typeof payload.metadata?.stepNumber === 'number' ? payload.metadata.stepNumber : 0;
    const campaignId = payload.campaignId ?? 'standalone';
    const logId = `del-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (this.config.dryRun) {
      return {
        id: logId,
        campaignId,
        recipientEmail: payload.to,
        stepNumber,
        tier,
        status: 'DRY_RUN',
        timestamp: Date.now(),
        messageId: `dry-${Date.now()}`,
      };
    }

    let attempt = 0;
    let lastError = '';

    while (attempt <= this.config.maxRetries) {
      try {
        const { messageId } = await this.sender(payload);
        return {
          id: logId,
          campaignId,
          recipientEmail: payload.to,
          stepNumber,
          tier,
          status: 'SENT',
          timestamp: Date.now(),
          messageId,
        };
      } catch (err) {
        attempt++;
        const rawMsg = err instanceof Error ? err.message : String(err);
        lastError = sanitizeSecret(rawMsg);
        logger.warn(`[CampaignRunner] Delivery failed (attempt ${attempt}/${this.config.maxRetries}): ${lastError}`);

        if (attempt <= this.config.maxRetries) {
          const backoff = this.config.initialBackoffMs * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    return {
      id: logId,
      campaignId,
      recipientEmail: payload.to,
      stepNumber,
      tier,
      status: 'FAILED',
      timestamp: Date.now(),
      error: lastError,
    };
  }

  public async deliverBatch(payloads: CampaignEmailPayload[]): Promise<DeliveryLog[]> {
    const results: DeliveryLog[] = [];
    const { batchSize, rateLimitDelayMs } = this.config;

    for (let i = 0; i < payloads.length; i += batchSize) {
      const batch = payloads.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((p) => this.deliverSingle(p)));
      results.push(...batchResults);

      if (i + batchSize < payloads.length && rateLimitDelayMs > 0) {
        await new Promise((r) => setTimeout(r, rateLimitDelayMs));
      }
    }

    return results;
  }
}
