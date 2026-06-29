/**
 * Invoice Generator
 * a16z Solo Company Layer 3: Auto-invoice on payment success
 *
 * Generates invoice (JSON + HTML) when NOWPayments webhook confirms payment.
 * Stores in data/invoices/. Emails invoice to customer via SendGrid.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EmailService } from '../notifications/email-service.js';
import { logger } from '../shared/utils/logger.js';

const INVOICE_DIR = join(process.cwd(), 'data', 'invoices');

/** Escape HTML special characters to prevent XSS in invoice templates */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface Invoice {
  invoiceId: string;
  paymentId: string;
  email: string;
  tier: string;
  amount: number;
  currency: string;
  status: 'paid';
  issuedAt: string;
  paidAt: string;
}

function ensureDir(): void {
  if (!existsSync(INVOICE_DIR)) mkdirSync(INVOICE_DIR, { recursive: true });
}

/** Generate a unique invoice ID: INV-YYYYMMDD-XXXX */
function generateInvoiceId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${date}-${rand}`;
}

/** Generate invoice HTML for email */
function renderInvoiceHtml(inv: Invoice): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0B0E11;color:#E8EAED">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
    <h2 style="color:#00D4AA;margin:0">CashClaw</h2>
    <span style="color:#888;font-size:12px">INVOICE</span>
  </div>
  <div style="background:#161A1E;padding:20px;border-radius:8px;margin-bottom:16px">
    <table style="width:100%;border-collapse:collapse;color:#E8EAED;font-size:14px">
      <tr><td style="padding:8px 0;color:#888">Invoice #</td><td style="padding:8px 0;text-align:right;font-family:monospace">${esc(inv.invoiceId)}</td></tr>
      <tr><td style="padding:8px 0;color:#888">Date</td><td style="padding:8px 0;text-align:right">${new Date(inv.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td></tr>
      <tr><td style="padding:8px 0;color:#888">Payment ID</td><td style="padding:8px 0;text-align:right;font-family:monospace;font-size:12px">${esc(inv.paymentId)}</td></tr>
      <tr style="border-top:1px solid #2A2E33"><td style="padding:12px 0;color:#888">Plan</td><td style="padding:12px 0;text-align:right;font-weight:bold">${esc(inv.tier)}</td></tr>
      <tr><td style="padding:8px 0;color:#888">Amount</td><td style="padding:8px 0;text-align:right;font-size:20px;font-weight:bold;color:#00D4AA">$${inv.amount.toFixed(2)} ${esc(inv.currency)}</td></tr>
      <tr><td style="padding:8px 0;color:#888">Status</td><td style="padding:8px 0;text-align:right"><span style="background:rgba(0,212,170,0.15);color:#00D4AA;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:bold">PAID</span></td></tr>
    </table>
  </div>
  <p style="color:#888;font-size:12px;text-align:center;margin-top:24px">
    CashClaw — Prediction Market Analytics<br>
    This invoice was generated automatically. No action required.
  </p>
</div>`.trim();
}

/** Generate plain text invoice */
function renderInvoiceText(inv: Invoice): string {
  return [
    'INVOICE — CashClaw',
    `Invoice #: ${inv.invoiceId}`,
    `Date: ${new Date(inv.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    `Payment ID: ${inv.paymentId}`,
    `Plan: ${inv.tier}`,
    `Amount: $${inv.amount.toFixed(2)} ${inv.currency}`,
    `Status: PAID`,
    '',
    'This invoice was generated automatically.',
    'CashClaw — Prediction Market Analytics',
  ].join('\n');
}

/** Create and store an invoice, then email it */
export async function generateInvoice(opts: {
  paymentId: string;
  email: string;
  tier: string;
  amount: number;
  currency: string;
}): Promise<Invoice> {
  ensureDir();

  const invoice: Invoice = {
    invoiceId: generateInvoiceId(),
    paymentId: opts.paymentId,
    email: opts.email,
    tier: opts.tier,
    amount: opts.amount,
    currency: opts.currency.toUpperCase(),
    status: 'paid',
    issuedAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
  };

  // Save invoice JSON
  const filePath = join(INVOICE_DIR, `${invoice.invoiceId}.json`);
  writeFileSync(filePath, JSON.stringify(invoice, null, 2));
  logger.info(`[Invoice] Generated ${invoice.invoiceId} for ${opts.email} ($${opts.amount})`);

  // Email invoice to customer
  try {
    const emailSvc = EmailService.getInstance();
    if (!emailSvc.isInitialized()) emailSvc.initialize();
    if (emailSvc.isInitialized()) {
      await emailSvc.send({
        to: opts.email,
        subject: `CashClaw Invoice ${invoice.invoiceId} — $${opts.amount.toFixed(2)}`,
        body: renderInvoiceText(invoice),
        html: renderInvoiceHtml(invoice),
      });
      logger.info(`[Invoice] Emailed invoice ${invoice.invoiceId} to ${opts.email}`);
    }
  } catch (err) {
    logger.warn(`[Invoice] Email send failed for ${invoice.invoiceId}`, { error: err instanceof Error ? err.message : err });
  }

  return invoice;
}

/** List all invoices for a given email */
export function listInvoices(email?: string): Invoice[] {
  ensureDir();
  const files: string[] = existsSync(INVOICE_DIR) ? readdirSync(INVOICE_DIR) as string[] : [];
  const invoices: Invoice[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const inv = JSON.parse(readFileSync(join(INVOICE_DIR, f), 'utf-8')) as Invoice;
      if (!email || inv.email === email) invoices.push(inv);
    } catch { /* skip corrupt files */ }
  }
  return invoices.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}
