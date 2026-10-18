/**
 * Welcome Email Drip Sequence
 * a16z Solo Company Layer 2+5: Auto-onboard + auto-support
 *
 * 3-email sequence triggered after signup activation:
 *   Day 0: Welcome + quickstart guide
 *   Day 1: Feature highlights + first trade guide
 *   Day 3: Tips + upgrade CTA
 *
 * Drip state stored in data/drip.json. Runs via PM2 cron (hourly check).
 */

import { join } from 'node:path';
import { EmailService } from '../../platform/notifications/email-service';
import { logger } from '../../shared/utils/logger';
import { readJson, writeJson } from '../../shared/persistence/persistent-store';

import {
  DRIP_EMAILS,
  type DripEmailTemplate,
  type DripRecipient,
  type DripState,
  isDripEmailDue,
  retainActiveDripRecipients,
} from './welcome-email-drip-templates';

export {
  DRIP_EMAILS,
  type DripEmailTemplate,
  type DripRecipient,
  type DripState,
  isDripEmailDue,
  retainActiveDripRecipients,
};

const DRIP_DATA_DIR = join(process.cwd(), 'data', 'drip');
const DRIP_STATE_FILE = join(DRIP_DATA_DIR, 'state.json');

function loadState(): DripState {
  return readJson<DripState>(DRIP_STATE_FILE) ?? { recipients: [] };
}

function saveState(state: DripState): void {
  writeJson(DRIP_STATE_FILE, state);
}

/** Register a new recipient for the drip sequence */
export function registerDripRecipient(email: string, tier: string): void {
  const state = loadState();
  if (state.recipients.some(r => r.email === email)) {
    logger.info(`[Drip] ${email} already registered, skipping`);
    return;
  }
  state.recipients.push({ email, tier, activatedAt: new Date().toISOString(), emailsSent: [] });
  saveState(state);
  logger.info(`[Drip] Registered ${email} (${tier}) for welcome sequence`);
}

/** Process pending drip emails — called hourly by PM2 cron */
export async function processDripQueue(): Promise<void> {
  const state = loadState();
  const emailSvc = EmailService.getInstance();
  if (!emailSvc.isInitialized()) emailSvc.initialize();
  if (!emailSvc.isInitialized()) {
    logger.warn('[Drip] SendGrid not configured, skipping drip processing');
    return;
  }

  const now = Date.now();
  let sent = 0;

  for (const recipient of state.recipients) {
    const activatedMs = new Date(recipient.activatedAt).getTime();

    for (let i = 0; i < DRIP_EMAILS.length; i++) {
      if (recipient.emailsSent.includes(i)) continue;

      const email = DRIP_EMAILS[i]!;
      if (isDripEmailDue(activatedMs, email.delayHours, now)) {
        const success = await emailSvc.send({
          to: recipient.email,
          subject: email.subject,
          body: email.body(recipient.tier),
          html: email.html(recipient.tier),
        });
        if (success) {
          recipient.emailsSent.push(i);
          sent++;
          logger.info(`[Drip] Sent email ${i + 1}/3 to ${recipient.email}`);
        }
      }
    }
  }

  state.recipients = retainActiveDripRecipients(state.recipients, now);
  saveState(state);
  if (sent > 0) logger.info(`[Drip] Sent ${sent} drip emails this cycle`);
}

// CLI entry point
if (process.argv[1]?.endsWith('welcome-email-drip.ts') ||
    process.argv[1]?.endsWith('welcome-email-drip.js')) {
  processDripQueue()
    .then(() => process.exit(0))
    .catch((err) => { logger.error('[Drip] Failed', { error: err }); process.exit(1); });
}
