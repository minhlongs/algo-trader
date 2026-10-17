/**
 * Pure template, eligibility, and batch delivery helpers for CampaignDispatcher.
 */

import type {
  Campaign,
  CampaignSubscriber,
  CampaignEmailPayload,
  DeliveryLog,
} from './types/campaign-types';

export interface PendingCampaignItem {
  payload: CampaignEmailPayload;
  subscriberEmail: string;
  stepNumber: number;
}

/**
 * Render `{{key}}` placeholders in a campaign template string.
 */
export function renderCampaignTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

/**
 * Evaluate subscribers against campaign steps and build pending email payloads.
 */
export function buildPendingCampaignPayloads(
  campaign: Campaign,
  subscribers: Iterable<CampaignSubscriber>,
  now: number,
): { pendingPayloads: PendingCampaignItem[]; evaluatedCount: number } {
  const pendingPayloads: PendingCampaignItem[] = [];
  let evaluatedCount = 0;

  for (const sub of subscribers) {
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

      const htmlBody = renderCampaignTemplate(step.htmlTemplate, templateVars);
      const textBody = step.textTemplate ? renderCampaignTemplate(step.textTemplate, templateVars) : undefined;
      const subject = renderCampaignTemplate(step.subject, templateVars);

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

  return { pendingPayloads, evaluatedCount };
}

/**
 * Record delivery logs and mark completed steps on subscribers.
 */
export function applyDeliveryResults(
  deliveryLogs: DeliveryLog[],
  pendingPayloads: PendingCampaignItem[],
  subscribers: Map<string, CampaignSubscriber>,
  deliveryHistory: DeliveryLog[],
): DeliveryLog[] {
  const logs: DeliveryLog[] = [];
  for (let i = 0; i < deliveryLogs.length; i++) {
    const log = deliveryLogs[i];
    logs.push(log);
    deliveryHistory.push(log);

    if (log.status === 'SENT' || log.status === 'DRY_RUN') {
      const item = pendingPayloads[i];
      const sub = subscribers.get(item.subscriberEmail);
      if (sub && !sub.completedSteps.includes(item.stepNumber)) {
        sub.completedSteps.push(item.stepNumber);
      }
    }
  }
  return logs;
}
