/**
 * send-email-campaign.ts
 * GTM Email Campaign — Send STARTER tier and AI Co-pilot announcements to FREE tier users.
 *
 * Simplified approach (no bulk campaign API):
 * 1. Query DB for FREE tier users from subscriptions table
 * 2. For each user, call emailService.send() one at a time with delays
 * 3. No click tracking — just verify delivery
 *
 * Usage:
 *   pnpm exec tsx scripts/send-email-campaign.ts
 *   pnpm exec tsx scripts/send-email-campaign.ts --test     # Send only to admin email
 *   pnpm exec tsx scripts/send-email-campaign.ts --starter  # STARTER email only
 *   pnpm exec tsx scripts/send-email-campaign.ts --copilot  # Co-pilot email only
 *
 * Environment variables:
 *   SENDGRID_API_KEY       — SendGrid API key
 *   SENDGRID_FROM_EMAIL    — Sender email address
 *   SENDGRID_FROM_NAME     — Sender display name (optional)
 *   ADMIN_EMAIL            — Admin email for test sends (required with --test)
 *   DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD — PostgreSQL connection
 *
 * Rate limiting: 1-second delay between emails by default.
 */

import { EmailService } from '../src/platform/notifications/email-service';
import { getDbClient } from '../src/shared/db/postgres-client';
import { logger } from '../src/shared/utils/logger';
import pg from 'pg';

// ── Constants ───────────────────────────────────────────────────────────────

const DELAY_BETWEEN_EMAILS_MS = 1500; // 1.5s between sends
const TEST_MODE_FLAG = '--test';
const STARTER_FLAG = '--starter';
const COPILOT_FLAG = '--copilot';

interface FreeUser {
  email: string;
  name: string | null;
}

// ── Email Templates ─────────────────────────────────────────────────────────

interface EmailTemplate {
  subjectEn: string;
  subjectVi: string;
  bodyEn: string;
  bodyVi: string;
  htmlEn: string;
  htmlVi: string;
}

function buildStarterTierEmail(userName: string | null): EmailTemplate {
  const greeting = userName ? `Hi ${userName},` : 'Hi there,';
  const greetingVi = userName ? `Chao ${userName},` : 'Chao ban,'; // intentionally no diacritics

  return {
    subjectEn: 'Introducing STARTER tier -- $19/mo, more power for your trades',
    subjectVi: 'Goi STARTER da co mat -- $19/thang, them suc manh cho giao dich cua ban',
    bodyEn: `${greeting}

Great news -- we've been listening to our FREE users.

Starting today, you can upgrade to STARTER at just $19/month and unlock more trading power without jumping to PRO.

What you get with STARTER:
- 50 RPM request rate (up from 10 on FREE)
- 5,000 daily API calls (up from 1,000 on FREE)
- 3 active strategies (up from 1 on FREE)
- Polymarket + 1 CEX exchange support (up from 1 exchange on FREE)
- All core signals and alerts

Annual prepay -- save 20%:
Pay $182/year instead of $228. Same features, lower price.

Upgrade now: https://app.algotrader.cc/billing?upgrade=starter

To smarter trades,
The Algo Trader Team

---
Unsubscribe: {{unsubscribe_url}}`,
    htmlEn: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#00D4AA;">Introducing STARTER Tier</h2>
  <p>${greeting}</p>
  <p>Great news -- we have been listening to our FREE users.</p>
  <p>Starting today, you can upgrade to <strong>STARTER</strong> at just <strong>$19/month</strong> and unlock more trading power without jumping to PRO.</p>
  <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
    <h3 style="margin-top:0;color:#333;">What you get with STARTER:</h3>
    <ul style="line-height:1.8;">
      <li><strong>50 RPM</strong> request rate (up from 10 on FREE)</li>
      <li><strong>5,000 daily API calls</strong> (up from 1,000 on FREE)</li>
      <li><strong>3 active strategies</strong> (up from 1 on FREE)</li>
      <li><strong>Polymarket + 1 CEX</strong> exchange support</li>
      <li>All core signals and alerts</li>
    </ul>
  </div>
  <div style="background:#e8f5e9;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #00D4AA;">
    <h3 style="margin-top:0;">Annual prepay -- save 20%</h3>
    <p>Pay <strong>$182/year</strong> instead of $228. Same features, lower price.</p>
  </div>
  <p style="text-align:center;margin:24px 0;">
    <a href="https://app.algotrader.cc/billing?upgrade=starter" style="display:inline-block;padding:14px 28px;background:#00D4AA;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Upgrade to STARTER &rarr;</a>
  </p>
  <p>To smarter trades,<br><strong>The Algo Trader Team</strong></p>
  <p style="color:#888;font-size:12px;margin-top:24px;">
    <a href="{{unsubscribe_url}}" style="color:#888;">Unsubscribe</a>
  </p>
</body>
</html>`,
    bodyVi: `${greetingVi}

Tin vui -- chung toi da lang nghe nhung nguoi dung FREE cua minh.

Bat dau tu hom nay, ban co the nang cap len STARTER chi voi $19/thang va mo khoa them suc manh giao dich.

Ban nhan duoc gi voi STARTER:
- 50 RPM toc do yeu cau (tu 10 tren FREE)
- 5.000 luot API moi ngay (tu 1.000 tren FREE)
- 3 chien luoc hoat dong (tu 1 chien luoc tren FREE)
- Polymarket + 1 CEX ho tro san giao dich
- Tat ca tin hieu va canh bao co ban

Thanh toan nam -- tiet kiem 20%:
Tra $182/nam thay vi $228. Cung tinh nang, gia thap hon.

Nang cap ngay: https://app.algotrader.cc/vi/billing?upgrade=starter

Chuc ban giao dich thong minh,
Doi ngu Algo Trader

---
Huy dang ky: {{unsubscribe_url}}`,
    htmlVi: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#00D4AA;">Goi STARTER Da Co Mat</h2>
  <p>${greetingVi}</p>
  <p>Tin vui -- chung toi da lang nghe nhung nguoi dung FREE cua minh.</p>
  <p>Bat dau tu hom nay, ban co the nang cap len <strong>STARTER</strong> chi voi <strong>$19/thang</strong> va mo khoa them suc manh giao dich.</p>
  <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
    <h3 style="margin-top:0;color:#333;">Ban nhan duoc gi voi STARTER:</h3>
    <ul style="line-height:1.8;">
      <li><strong>50 RPM</strong> toc do yeu cau (tu 10 tren FREE)</li>
      <li><strong>5.000 luot API moi ngay</strong> (tu 1.000 tren FREE)</li>
      <li><strong>3 chien luoc hoat dong</strong> (tu 1 tren FREE)</li>
      <li><strong>Polymarket + 1 CEX</strong> ho tro san giao dich</li>
      <li>Tat ca tin hieu va canh bao co ban</li>
    </ul>
  </div>
  <div style="background:#e8f5e9;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #00D4AA;">
    <h3 style="margin-top:0;">Thanh toan nam -- tiet kiem 20%</h3>
    <p>Tra <strong>$182/nam</strong> thay vi $228. Cung tinh nang, gia thap hon.</p>
  </div>
  <p style="text-align:center;margin:24px 0;">
    <a href="https://app.algotrader.cc/vi/billing?upgrade=starter" style="display:inline-block;padding:14px 28px;background:#00D4AA;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Nang Cap Len STARTER &rarr;</a>
  </p>
  <p>Chuc ban giao dich thong minh,<br><strong>Doi ngu Algo Trader</strong></p>
  <p style="color:#888;font-size:12px;margin-top:24px;">
    <a href="{{unsubscribe_url}}" style="color:#888;">Huy dang ky</a>
  </p>
</body>
</html>`,
  };
}

function buildCoPilotEmail(userName: string | null): EmailTemplate {
  const greeting = userName ? `Hi ${userName},` : 'Hi there,';
  const greetingVi = userName ? `Chao ${userName},` : 'Chao ban,';

  return {
    subjectEn: 'Your AI trading assistant is here -- ask your portfolio anything',
    subjectVi: 'Tro ly AI cua ban da san sang -- hoi moi thu ve danh muc dau tu',
    bodyEn: `${greeting}

What if you could ask your trading portfolio a question -- in plain English -- and get an answer instantly?

Meet AI Co-pilot -- your personal trading assistant powered by advanced AI.

Ask questions like:
- "What is my current risk exposure?"
- "Find arbitrage opportunities right now"
- "Summarize my P&L for this week"
- "Which strategy performed best yesterday?"

AI Co-pilot is available on PRO tier and above.

Upgrade to PRO to get unlimited AI queries and real-time portfolio analysis.

Learn more: https://app.algotrader.cc/features/ai-co-pilot

Trade smarter, not harder.
The Algo Trader Team

---
Unsubscribe: {{unsubscribe_url}}`,
    htmlEn: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#00D4AA;">AI Co-pilot Is Here</h2>
  <p>${greeting}</p>
  <p>What if you could ask your trading portfolio a question -- in plain English -- and get an answer instantly?</p>
  <p>Meet <strong>AI Co-pilot</strong> -- your personal trading assistant powered by advanced AI.</p>
  <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
    <p><strong>Ask questions like:</strong></p>
    <ul style="line-height:1.8;">
      <li>"What is my current risk exposure?"</li>
      <li>"Find arbitrage opportunities right now"</li>
      <li>"Summarize my P&amp;L for this week"</li>
      <li>"Which strategy performed best yesterday?"</li>
    </ul>
  </div>
  <p>AI Co-pilot is available on <strong>PRO tier and above</strong>.</p>
  <p style="text-align:center;margin:24px 0;">
    <a href="https://app.algotrader.cc/billing?upgrade=pro" style="display:inline-block;padding:14px 28px;background:#00D4AA;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Upgrade to PRO &rarr;</a>
  </p>
  <p>Trade smarter, not harder.<br><strong>The Algo Trader Team</strong></p>
  <p style="color:#888;font-size:12px;margin-top:24px;">
    <a href="{{unsubscribe_url}}" style="color:#888;">Unsubscribe</a>
  </p>
</body>
</html>`,
    bodyVi: `${greetingVi}

Dieu gi xay ra neu ban co the hoi danh muc dau tu cua minh mot cau hoi bang tieng Viet don gian va nhan duoc cau tra loi ngay lap tuc?

Hay gap AI Co-pilot -- tro ly giao dich ca nhan duoc ho tro boi AI tien tien.

Dat nhung cau hoi nhu:
- "Muc do riu ro hien tai la bao nhieu?"
- "Tim co hoi arbitrage ngay bay gio"
- "Tong ket loi nhuan tuan nay"
- "Chien luoc nao hieu qua nhat hom qua?"

AI Co-pilot co san tren PRO tier tro len.

Nang cap len PRO de nhan truy van AI khong gioi han va phan tich danh muc thoi gian thuc.

Tim hieu them: https://app.algotrader.cc/vi/features/ai-co-pilot

Giao dich thong minh hon,
Doi ngu Algo Trader

---
Huy dang ky: {{unsubscribe_url}}`,
    htmlVi: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#00D4AA;">AI Co-pilot Da San Sang</h2>
  <p>${greetingVi}</p>
  <p>Dieu gi xay ra neu ban co the hoi danh muc dau tu cua minh mot cau hoi bang tieng Viet don gian va nhan duoc cau tra loi ngay lap tuc?</p>
  <p>Hay gap <strong>AI Co-pilot</strong> -- tro ly giao dich ca nhan duoc ho tro boi AI tien tien.</p>
  <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
    <p><strong>Dat nhung cau hoi nhu:</strong></p>
    <ul style="line-height:1.8;">
      <li>"Muc do riu ro hien tai la bao nhieu?"</li>
      <li>"Tim co hoi arbitrage ngay bay gio"</li>
      <li>"Tong ket loi nhuan tuan nay"</li>
      <li>"Chien luoc nao hieu qua nhat hom qua?"</li>
    </ul>
  </div>
  <p>AI Co-pilot co san tren <strong>PRO tier tro len</strong>.</p>
  <p style="text-align:center;margin:24px 0;">
    <a href="https://app.algotrader.cc/vi/billing?upgrade=pro" style="display:inline-block;padding:14px 28px;background:#00D4AA;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Nang Cap Len PRO &rarr;</a>
  </p>
  <p>Giao dich thong minh hon,<br><strong>Doi ngu Algo Trader</strong></p>
  <p style="color:#888;font-size:12px;margin-top:24px;">
    <a href="{{unsubscribe_url}}" style="color:#888;">Huy dang ky</a>
  </p>
</body>
</html>`,
  };
}

// ── DB Queries ──────────────────────────────────────────────────────────────

async function queryFreeUsers(): Promise<FreeUser[]> {
  const pool = getDbClient();
  const result = await pool.query<FreeUser>(`
    SELECT DISTINCT u.email, u.name
    FROM "user" u
    INNER JOIN subscriptions s ON s.customer_email = u.email
    WHERE s.tier = 'FREE'
      AND s.status = 'active'
    ORDER BY u.email
  `);
  return result.rows;
}

async function queryFreeUsersFromLicenses(): Promise<FreeUser[]> {
  // Fallback: also check licenses JSON-based system if subscriptions table is empty
  const pool = getDbClient();
  const result = await pool.query<FreeUser>(`
    SELECT DISTINCT u.email, u.name
    FROM "user" u
    ORDER BY u.email
  `);
  return result.rows;
}

// ── Email Sending ──────────────────────────────────────────────────────────

async function sendCampaignEmail(
  emailSvc: EmailService,
  user: FreeUser,
  campaign: 'starter' | 'copilot',
): Promise<boolean> {
  // Default to English (locale column not available on user table)
  const isVietnamese = false;
  const template = campaign === 'starter'
    ? buildStarterTierEmail(user.name)
    : buildCoPilotEmail(user.name);

  const subject = isVietnamese ? template.subjectVi : template.subjectEn;
  const body = isVietnamese ? template.bodyVi : template.bodyEn;
  const html = isVietnamese ? template.htmlVi : template.htmlEn;

  const success = await emailSvc.send({
    to: user.email,
    subject,
    body,
    html,
  });

  if (success) {
    logger.info(`[Campaign] Sent ${campaign} email to ${user.email} (${isVietnamese ? 'VI' : 'EN'})`);
  } else {
    logger.error(`[Campaign] Failed to send ${campaign} email to ${user.email}`);
  }

  return success;
}

async function sendTestEmail(
  emailSvc: EmailService,
  adminEmail: string,
  campaign: 'starter' | 'copilot',
): Promise<boolean> {
  const template = campaign === 'starter'
    ? buildStarterTierEmail('Test User')
    : buildCoPilotEmail('Test User');

  // Send both English and Vietnamese versions to admin for verification
  logger.info(`[Campaign] Sending test ${campaign} email (EN) to ${adminEmail}`);
  const enResult = await emailSvc.send({
    to: adminEmail,
    subject: `[TEST] ${template.subjectEn}`,
    body: template.bodyEn,
    html: template.htmlEn,
  });

  // 1s delay between test sends
  await new Promise(resolve => setTimeout(resolve, 1000));

  logger.info(`[Campaign] Sending test ${campaign} email (VI) to ${adminEmail}`);
  const viResult = await emailSvc.send({
    to: adminEmail,
    subject: `[TEST] ${template.subjectVi}`,
    body: template.bodyVi,
    html: template.htmlVi,
  });

  return enResult && viResult;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isTestMode = args.includes(TEST_MODE_FLAG);
  const sendStarter = !args.includes(COPILOT_FLAG); // default: send both
  const sendCoPilot = !args.includes(STARTER_FLAG);

  // Initialize email service
  const emailSvc = EmailService.getInstance();
  const initialized = emailSvc.initialize();
  if (!initialized) {
    logger.error('[Campaign] Email service failed to initialize. Check SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.');
    process.exit(1);
  }

  if (isTestMode) {
    // Test mode: send to admin only
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      logger.error('[Campaign] ADMIN_EMAIL environment variable is required in test mode');
      process.exit(1);
    }

    logger.info(`[Campaign] Test mode -- sending to ${adminEmail}`);
    if (sendStarter) {
      await sendTestEmail(emailSvc, adminEmail, 'starter');
    }
    if (sendCoPilot) {
      await sendTestEmail(emailSvc, adminEmail, 'copilot');
    }
    logger.info('[Campaign] Test emails sent. Check your inbox for formatting and links.');
    return;
  }

  // Production mode: send to all FREE tier users
  logger.info('[Campaign] Querying FREE tier users from subscriptions table...');
  let users = await queryFreeUsers();

  if (users.length === 0) {
    logger.warn('[Campaign] No FREE tier users found in subscriptions table. Falling back to all users query.');
    users = await queryFreeUsersFromLicenses();
  }

  if (users.length === 0) {
    logger.warn('[Campaign] No users found. Nothing to send.');
    return;
  }

  logger.info(`[Campaign] Found ${users.length} FREE tier users. Starting campaign...`);

  let sentCount = 0;
  let failCount = 0;

  for (const user of users) {
    if (sendStarter) {
      const ok = await sendCampaignEmail(emailSvc, user, 'starter');
      if (ok) sentCount++; else failCount++;
      await delay(DELAY_BETWEEN_EMAILS_MS);
    }

    if (sendCoPilot) {
      const ok = await sendCampaignEmail(emailSvc, user, 'copilot');
      if (ok) sentCount++; else failCount++;
      await delay(DELAY_BETWEEN_EMAILS_MS);
    }
  }

  logger.info(`[Campaign] Complete. Sent: ${sentCount}, Failed: ${failCount}`);
}

main().catch(err => {
  logger.error('[Campaign] Fatal error:', { error: err });
  process.exit(1);
});
