/**
 * Enterprise TAM Notifier
 * Sends internal notification to Technical Account Manager (TAM)
 * when a new enterprise inquiry is submitted.
 *
 * Email provider: uses existing EmailService (SendGrid).
 * Falls back to logger.warn if EmailService is not initialised.
 */

import { EmailService } from '../notifications/email-service';
import { logger } from '../../shared/utils/logger';
import { EnterpriseInquiry, ENTERPRISE_TIER_LABELS, ENTERPRISE_ACV } from './enterprise-inquiry-store';

/** TAM inbox — override via env var ENTERPRISE_TAM_EMAIL */
function getTamEmail(): string {
  return process.env['ENTERPRISE_TAM_EMAIL'] ?? 'tam@cashclaw.cc';
}

function buildTamEmailBody(inquiry: EnterpriseInquiry): string {
  const acv = ENTERPRISE_ACV[inquiry.tier].toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return [
    'NEW ENTERPRISE INQUIRY',
    '======================',
    `ID:        ${inquiry.id}`,
    `Company:   ${inquiry.companyName}`,
    `Contact:   ${inquiry.contactName} <${inquiry.email}>`,
    `Tier:      ${ENTERPRISE_TIER_LABELS[inquiry.tier]} (ACV ${acv})`,
    `Team size: ${inquiry.teamSize ?? 'not specified'}`,
    '',
    'USE CASE:',
    inquiry.useCase,
    '',
    `Submitted: ${new Date(inquiry.createdAt).toUTCString()}`,
    '',
    'Action: Log into TAM dashboard, claim this inquiry, and contact within 24 hours.',
  ].join('\n');
}

function buildTamEmailHtml(inquiry: EnterpriseInquiry): string {
  const acv = ENTERPRISE_ACV[inquiry.tier].toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0B0E11;color:#E8EAED">
  <h2 style="color:#00D4AA;margin-top:0">New Enterprise Inquiry</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="color:#888;padding:6px 0;width:120px">ID</td><td style="font-family:monospace">${esc(inquiry.id)}</td></tr>
    <tr><td style="color:#888;padding:6px 0">Company</td><td>${esc(inquiry.companyName)}</td></tr>
    <tr><td style="color:#888;padding:6px 0">Contact</td><td>${esc(inquiry.contactName)} &lt;${esc(inquiry.email)}&gt;</td></tr>
    <tr><td style="color:#888;padding:6px 0">Tier</td><td><strong style="color:#00D4AA">${esc(ENTERPRISE_TIER_LABELS[inquiry.tier])}</strong></td></tr>
    <tr><td style="color:#888;padding:6px 0">ACV</td><td><strong>${esc(acv)}</strong></td></tr>
    <tr><td style="color:#888;padding:6px 0">Team size</td><td>${esc(inquiry.teamSize ?? '—')}</td></tr>
  </table>
  <div style="margin:16px 0;padding:16px;background:#161A1E;border-radius:8px">
    <p style="color:#888;margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:1px">Use case</p>
    <p style="margin:0;font-size:14px">${esc(inquiry.useCase)}</p>
  </div>
  <p style="color:#888;font-size:12px">Contact within 24 hours. Invoice-based close — no self-serve checkout.</p>
</div>`.trim();
}

/** Notify TAM of a new enterprise inquiry. Never throws — logs on failure. */
export async function notifyTam(inquiry: EnterpriseInquiry): Promise<boolean> {
  const tamEmail = getTamEmail();

  try {
    const emailSvc = EmailService.getInstance();
    if (!emailSvc.isInitialized()) emailSvc.initialize();

    if (!emailSvc.isInitialized()) {
      logger.warn('[EnterpriseTAM] EmailService not configured — TAM notification skipped', {
        inquiryId: inquiry.id,
        tamEmail,
      });
      return false;
    }

    await emailSvc.send({
      to: tamEmail,
      subject: `[Enterprise] New inquiry: ${inquiry.companyName} — ${ENTERPRISE_TIER_LABELS[inquiry.tier]}`,
      body: buildTamEmailBody(inquiry),
      html: buildTamEmailHtml(inquiry),
    });

    logger.info('[EnterpriseTAM] TAM notified', { inquiryId: inquiry.id, tamEmail });
    return true;
  } catch (err) {
    logger.warn('[EnterpriseTAM] Failed to notify TAM', {
      inquiryId: inquiry.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
