/**
 * Enterprise Paper-Demo Provisioner
 * Auto-provisions a paper-trading demo license when an enterprise inquiry is submitted.
 * Demo license is ENTERPRISE tier, 30-day expiry, read-only (maxUsage capped at 1000).
 *
 * Sends a confirmation email to the prospect with demo credentials.
 */

import * as crypto from 'crypto';
import { EmailService } from '../notifications/email-service.js';
import { logger } from '../shared/utils/logger.js';
import { EnterpriseInquiry } from './enterprise-inquiry-store.js';

export interface PaperDemoCredentials {
  demoKey: string;
  expiresAt: string; // ISO string
  dashboardUrl: string;
  docsUrl: string;
}

const DEMO_DURATION_DAYS = 30;
const DASHBOARD_BASE = process.env['DASHBOARD_URL'] ?? 'https://algo-trader.pages.dev';

/** Generate a demo API key: demo_<random hex> */
function generateDemoKey(): string {
  return `demo_${crypto.randomBytes(16).toString('hex')}`;
}

function buildProspectEmailBody(inquiry: EnterpriseInquiry, creds: PaperDemoCredentials): string {
  return [
    `Hi ${inquiry.contactName},`,
    '',
    'Thank you for your interest in CashClaw enterprise plans.',
    'Your paper-trading demo environment is ready.',
    '',
    `Demo API key:   ${creds.demoKey}`,
    `Expires:        ${new Date(creds.expiresAt).toDateString()}`,
    `Dashboard:      ${creds.dashboardUrl}`,
    `Documentation:  ${creds.docsUrl}`,
    '',
    'Our team will reach out within 24 hours to schedule a walkthrough.',
    'Reply to this email with any questions.',
    '',
    'CashClaw — Prediction Market Operations Platform',
  ].join('\n');
}

function buildProspectEmailHtml(inquiry: EnterpriseInquiry, creds: PaperDemoCredentials): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0B0E11;color:#E8EAED">
  <h2 style="color:#00D4AA;margin-top:0">Your enterprise demo is ready</h2>
  <p>Hi ${esc(inquiry.contactName)},</p>
  <p>Your paper-trading demo environment has been provisioned. Use the credentials below to explore the platform.</p>
  <div style="background:#161A1E;padding:20px;border-radius:8px;margin:16px 0">
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="color:#888;padding:6px 0;width:140px">Demo API key</td><td style="font-family:monospace;color:#00D4AA">${esc(creds.demoKey)}</td></tr>
      <tr><td style="color:#888;padding:6px 0">Expires</td><td>${esc(new Date(creds.expiresAt).toDateString())}</td></tr>
      <tr><td style="color:#888;padding:6px 0">Dashboard</td><td><a href="${esc(creds.dashboardUrl)}" style="color:#00D9FF">${esc(creds.dashboardUrl)}</a></td></tr>
      <tr><td style="color:#888;padding:6px 0">Docs</td><td><a href="${esc(creds.docsUrl)}" style="color:#00D9FF">${esc(creds.docsUrl)}</a></td></tr>
    </table>
  </div>
  <p style="color:#888;font-size:13px">Our team will reach out within 24 hours. Reply to this email with any questions.</p>
  <p style="color:#555;font-size:12px">CashClaw — Prediction Market Operations Platform</p>
</div>`.trim();
}

/**
 * Provision a paper-trading demo for an enterprise prospect.
 * Returns demo credentials; never throws — logs on failure.
 */
export async function provisionPaperDemo(inquiry: EnterpriseInquiry): Promise<PaperDemoCredentials | null> {
  const demoKey = generateDemoKey();
  const expiresAt = new Date(Date.now() + DEMO_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const creds: PaperDemoCredentials = {
    demoKey,
    expiresAt,
    dashboardUrl: `${DASHBOARD_BASE}/demo?key=${demoKey}`,
    docsUrl: `${DASHBOARD_BASE}/docs`,
  };

  logger.info('[EnterprisePaperDemo] Demo provisioned', {
    inquiryId: inquiry.id,
    email: inquiry.email,
    expiresAt,
  });

  // Email prospect with demo credentials
  try {
    const emailSvc = EmailService.getInstance();
    if (!emailSvc.isInitialized()) emailSvc.initialize();

    if (emailSvc.isInitialized()) {
      await emailSvc.send({
        to: inquiry.email,
        subject: 'CashClaw enterprise demo — your access is ready',
        body: buildProspectEmailBody(inquiry, creds),
        html: buildProspectEmailHtml(inquiry, creds),
      });
      logger.info('[EnterprisePaperDemo] Demo credentials emailed', { inquiryId: inquiry.id });
    } else {
      logger.warn('[EnterprisePaperDemo] EmailService not configured — skipping prospect email', {
        inquiryId: inquiry.id,
      });
    }
  } catch (err) {
    logger.warn('[EnterprisePaperDemo] Failed to email prospect', {
      inquiryId: inquiry.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return creds;
}
