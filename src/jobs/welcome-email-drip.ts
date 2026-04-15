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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EmailService } from '../notifications/email-service.js';
import { logger } from '../utils/logger.js';

const DRIP_DATA_DIR = join(process.cwd(), 'data', 'drip');
const DRIP_STATE_FILE = join(DRIP_DATA_DIR, 'state.json');

interface DripRecipient {
  email: string;
  tier: string;
  activatedAt: string; // ISO timestamp
  emailsSent: number[]; // indices of sent emails (0, 1, 2)
}

interface DripState {
  recipients: DripRecipient[];
}

/** Email templates for the 3-step drip */
const DRIP_EMAILS = [
  {
    delayHours: 0,
    subject: 'Welcome to CashClaw — Your quickstart guide',
    body: (tier: string) => `Welcome to CashClaw!\n\nYour ${tier} plan is now active. Here's how to get started:\n\n1. Link your license key in Telegram: /link <your-key>\n2. Check today's signals: /status\n3. View live P&L: https://cashclaw.cc/trading-performance\n\nOur AI scans 5 prediction markets daily. Signals fire only when edge > 5%.\n\nQuestions? Reply to this email or use /support in Telegram.\n\n— CashClaw Team`,
    html: (tier: string) => `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#00D4AA">Welcome to CashClaw</h2>
        <p>Your <strong>${tier}</strong> plan is now active. Here's how to get started:</p>
        <ol style="line-height:1.8">
          <li>Link your license key in Telegram: <code>/link &lt;your-key&gt;</code></li>
          <li>Check today's signals: <code>/status</code></li>
          <li>View live P&amp;L: <a href="https://cashclaw.cc/trading-performance" style="color:#00D4AA">cashclaw.cc/trading-performance</a></li>
        </ol>
        <p>Our AI scans 5 prediction markets daily. Signals fire only when edge &gt; 5%.</p>
        <p style="color:#888;font-size:14px">Questions? Reply to this email or use /support in Telegram.</p>
      </div>`,
  },
  {
    delayHours: 24,
    subject: 'CashClaw: 3 features you should try today',
    body: (_tier: string) => `Hey there,\n\nHere are 3 CashClaw features worth exploring:\n\n1. Daily Signal Digest — Top opportunities delivered every morning via Telegram\n2. Endgame Strategy — Our highest-edge approach: buying near-certain outcomes at $0.92-0.97\n3. Risk Dashboard — Kelly Criterion sizing with 2% max per position\n\nPro tip: Start with paper trading to validate signals before committing real capital.\n\nRead more on our blog: https://cashclaw.cc/blog\n\n— CashClaw Team`,
    html: (_tier: string) => `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#00D4AA">3 Features Worth Exploring</h2>
        <div style="margin:16px 0;padding:16px;background:#0B0E11;border-radius:8px;border-left:3px solid #00D4AA">
          <strong>1. Daily Signal Digest</strong><br>Top opportunities every morning via Telegram
        </div>
        <div style="margin:16px 0;padding:16px;background:#0B0E11;border-radius:8px;border-left:3px solid #00D4AA">
          <strong>2. Endgame Strategy</strong><br>Buy near-certain outcomes at $0.92-0.97
        </div>
        <div style="margin:16px 0;padding:16px;background:#0B0E11;border-radius:8px;border-left:3px solid #00D4AA">
          <strong>3. Risk Dashboard</strong><br>Kelly Criterion sizing, 2% max per position
        </div>
        <p><strong>Pro tip:</strong> Start with paper trading to validate signals before committing real capital.</p>
        <p><a href="https://cashclaw.cc/blog" style="color:#00D4AA">Read more on our blog →</a></p>
      </div>`,
  },
  {
    delayHours: 72,
    subject: 'CashClaw: Tips from our best traders',
    body: (tier: string) => `Quick tips from CashClaw power users:\n\n• Focus on Endgame strategy — it has the highest win rate\n• Use half-Kelly sizing (not full Kelly) to reduce variance\n• Check signals at 7 AM when the daily digest drops\n• Set a 5% daily stop-loss and stick to it\n\n${tier === 'FREE' || tier === 'STARTER' ? 'Ready for more? Pro subscribers get real-time signal streaming and auto-execution.\n\nUpgrade at: https://cashclaw.cc/#pricing' : 'You have full access to all features. Make the most of auto-execution and the real-time feed.'}\n\n— CashClaw Team`,
    html: (tier: string) => `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#00D4AA">Tips From Power Users</h2>
        <ul style="line-height:2">
          <li>Focus on <strong>Endgame strategy</strong> — highest win rate</li>
          <li>Use <strong>half-Kelly sizing</strong> to reduce variance</li>
          <li>Check signals at <strong>7 AM</strong> (daily digest)</li>
          <li>Set a <strong>5% daily stop-loss</strong> and stick to it</li>
        </ul>
        ${tier === 'FREE' || tier === 'STARTER' ? '<div style="margin:20px 0;padding:16px;background:#0B0E11;border-radius:8px;text-align:center"><p>Ready for more?</p><a href="https://cashclaw.cc/#pricing" style="display:inline-block;padding:12px 24px;background:#00D4AA;color:#0B0E11;text-decoration:none;border-radius:6px;font-weight:bold">Upgrade to Pro →</a></div>' : '<p>You have full access. Make the most of auto-execution and the real-time feed.</p>'}
      </div>`,
  },
];

function ensureDripDir(): void {
  if (!existsSync(DRIP_DATA_DIR)) mkdirSync(DRIP_DATA_DIR, { recursive: true });
}

function loadState(): DripState {
  ensureDripDir();
  if (!existsSync(DRIP_STATE_FILE)) return { recipients: [] };
  try {
    return JSON.parse(readFileSync(DRIP_STATE_FILE, 'utf-8'));
  } catch {
    return { recipients: [] };
  }
}

function saveState(state: DripState): void {
  ensureDripDir();
  writeFileSync(DRIP_STATE_FILE, JSON.stringify(state, null, 2));
}

/** Register a new recipient for the drip sequence */
export function registerDripRecipient(email: string, tier: string): void {
  const state = loadState();
  const exists = state.recipients.some(r => r.email === email);
  if (exists) {
    logger.info(`[Drip] ${email} already registered, skipping`);
    return;
  }
  state.recipients.push({
    email,
    tier,
    activatedAt: new Date().toISOString(),
    emailsSent: [],
  });
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
      const dueMs = activatedMs + email.delayHours * 3600_000;

      if (now >= dueMs) {
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

  // Clean up completed recipients (all 3 emails sent, older than 7 days)
  const sevenDaysAgo = now - 7 * 86400_000;
  state.recipients = state.recipients.filter(r =>
    r.emailsSent.length < DRIP_EMAILS.length ||
    new Date(r.activatedAt).getTime() > sevenDaysAgo
  );

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
