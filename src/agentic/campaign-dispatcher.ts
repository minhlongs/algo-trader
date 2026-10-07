/**
 * Autonomous Campaign Dispatcher
 *
 * Orchestrates drip email campaigns across user tiers (FREE, BASIC, PREMIUM, MASTER),
 * evaluating subscriber progress, delays, and executing via CampaignRunner.
 */

import { logger } from '../shared/utils/logger';
import { CampaignRunner, sanitizeSecret } from './campaign-runner';
import type {
  Campaign,
  CampaignSubscriber,
  CampaignDispatchResult,
  DeliveryLog,
  CampaignEmailPayload,
} from './types/campaign-types';
import { CampaignSchema, CampaignSubscriberSchema } from './types/campaign-types';

export interface DispatchOptions {
  now?: number;
  batchSize?: number;
  dryRun?: boolean;
}

export class CampaignDispatcher {
  private readonly campaigns = new Map<string, Campaign>();
  private readonly subscribers = new Map<string, CampaignSubscriber>();
  private readonly deliveryHistory: DeliveryLog[] = [];
  private readonly runner: CampaignRunner;

  constructor(runner?: CampaignRunner) {
    this.runner = runner ?? new CampaignRunner();
  }

  public registerCampaign(campaign: Campaign): void {
    const validated = CampaignSchema.parse(campaign);
    this.campaigns.set(validated.id, validated);
    logger.info(`[CampaignDispatcher] Registered campaign: ${validated.id} (${validated.name})`);
  }

  public registerSubscriber(subscriber: CampaignSubscriber): void {
    const validated = CampaignSubscriberSchema.parse(subscriber);
    this.subscribers.set(validated.email, validated);
  }

  public registerSubscribers(subscribers: CampaignSubscriber[]): void {
    for (const sub of subscribers) {
      this.registerSubscriber(sub);
    }
  }

  public getSubscriber(email: string): CampaignSubscriber | undefined {
    return this.subscribers.get(email);
  }

  public getHistory(): DeliveryLog[] {
    return [...this.deliveryHistory];
  }

  public getCampaign(id: string): Campaign | undefined {
    return this.campaigns.get(id);
  }

  private renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
  }

  public async dispatchCampaign(campaignId: string, options: DispatchOptions = {}): Promise<CampaignDispatchResult> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      throw new Error(`[CampaignDispatcher] Campaign not found: ${campaignId}`);
    }

    if (campaign.status !== 'ACTIVE') {
      logger.info(`[CampaignDispatcher] Campaign ${campaignId} is ${campaign.status}, skipping dispatch`);
      return {
        campaignId,
        dispatchedAt: Date.now(),
        totalSubscribersEvaluated: 0,
        emailsQueued: 0,
        deliveryLogs: [],
        dryRun: Boolean(options.dryRun),
      };
    }

    const now = options.now ?? Date.now();
    const pendingPayloads: { payload: CampaignEmailPayload; subscriberEmail: string; stepNumber: number }[] = [];
    let evaluatedCount = 0;

    for (const sub of this.subscribers.values()) {
      evaluatedCount++;
      if (!campaign.targetTiers.includes(sub.tier)) {
        continue;
      }

      const elapsedHours = (now - sub.signupTimestamp) / (1000 * 60 * 60);

      for (const step of campaign.steps) {
        if (sub.completedSteps.includes(step.stepNumber)) {
          continue;
        }
        if (!step.targetTiers.includes(sub.tier)) {
          continue;
        }
        if (elapsedHours < step.delayHours) {
          continue;
        }

        const templateVars: Record<string, string> = {
          tier: sub.tier,
          email: sub.email,
          campaignName: campaign.name,
        };

        const htmlBody = this.renderTemplate(step.htmlTemplate, templateVars);
        const textBody = step.textTemplate ? this.renderTemplate(step.textTemplate, templateVars) : undefined;
        const subject = this.renderTemplate(step.subject, templateVars);

        pendingPayloads.push({
          payload: {
            to: sub.email,
            subject,
            htmlBody,
            textBody,
            tier: sub.tier,
            campaignId: campaign.id,
            metadata: { stepNumber: step.stepNumber },
          },
          subscriberEmail: sub.email,
          stepNumber: step.stepNumber,
        });
        break; // Only queue next pending step per subscriber in single run
      }
    }

    const runner = options.dryRun !== undefined
      ? new CampaignRunner({ dryRun: options.dryRun })
      : this.runner;

    const logs: DeliveryLog[] = [];
    try {
      const emailPayloads = pendingPayloads.map((p) => p.payload);
      const deliveryLogs = await runner.deliverBatch(emailPayloads);

      for (let i = 0; i < deliveryLogs.length; i++) {
        const log = deliveryLogs[i];
        logs.push(log);
        this.deliveryHistory.push(log);

        if (log.status === 'SENT' || log.status === 'DRY_RUN') {
          const item = pendingPayloads[i];
          const sub = this.subscribers.get(item.subscriberEmail);
          if (sub && !sub.completedSteps.includes(item.stepNumber)) {
            sub.completedSteps.push(item.stepNumber);
          }
        }
      }
    } catch (err) {
      const safeError = sanitizeSecret(err instanceof Error ? err.message : String(err));
      logger.error(`[CampaignDispatcher] Dispatch run failed: ${safeError}`);
    }

    return {
      campaignId,
      dispatchedAt: now,
      totalSubscribersEvaluated: evaluatedCount,
      emailsQueued: pendingPayloads.length,
      deliveryLogs: logs,
      dryRun: runner.getConfig().dryRun,
    };
  }

  public async dispatchAllActive(options: DispatchOptions = {}): Promise<CampaignDispatchResult[]> {
    const results: CampaignDispatchResult[] = [];
    for (const campaign of this.campaigns.values()) {
      if (campaign.status === 'ACTIVE') {
        results.push(await this.dispatchCampaign(campaign.id, options));
      }
    }
    return results;
  }
}
