/**
 * Revenue Source of Truth — fixture-corpus guard
 *
 * `data/invoices/` holds ~16k JSON invoices that are entirely E2E/fixture residue:
 * every file carries `status: "paid"`, every email is one of six test addresses, and a naive
 * sum reports $2,221,480 — a $26.7M ARR claim from zero real customers. The authoritative
 * revenue answer is MRR = 0. This module makes that impossible, so revenue or customer-count
 * computation must pass through here first: test residue can never be rolled up into a growth
 * narrative, and a corpus with no real customers fails loudly instead of silently reporting a
 * seven-figure number.
 *
 * Pure functions over a narrow invoice shape — no DB, no fs. See `readInvoiceCorpus` below for
 * the one fs-backed helper.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Email addresses observed in the `data/invoices/` fixture corpus. Kept as an explicit
 * denylist so the exact addresses written by `invoice-generator.ts` during E2E runs are
 * recognisable, not merely "suspicious". Anything matching `FIXTURE_DOMAIN_PATTERNS`
 * below is also treated as a fixture.
 */
export const FIXTURE_EMAILS: ReadonlySet<string> = new Set([
  'e2e-customer@test.com',
  'a@b.com',
  'invoice-test@example.com',
  'user&test@example.com',
  'curr@example.com',
  'fail@example.com',
]);

/**
 * Fixture/test-only domains, RFC 2606 reserved names plus `test.com` and the `.test` TLD.
 * A future fixture that invents a new local part at one of these domains is still caught.
 */
const FIXTURE_DOMAIN_PATTERNS: readonly RegExp[] = [
  /^example\.com$/i,
  /^example\.org$/i,
  /^example\.net$/i,
  /^test\.com$/i,
  /(^|\.)test$/i,
  /^invalid$/i,
];

/** Minimal invoice shape — works on the on-disk invoice JSON and any parsed variant. */
export interface InvoiceLike {
  email?: string | null;
  status?: string | null;
  amount?: number | string | null;
}

/** Statuses that represent money actually settled. Anything else is not revenue. */
const PAID_STATUSES: ReadonlySet<string> = new Set([
  'paid',
  'settled',
  'succeeded',
  'success',
  'complete',
  'completed',
  'finished',
]);

/** Lowercase, trimmed email, or null when absent/blank. */
function normalizeEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** True when the address is a known fixture account or lives at a reserved test domain. */
export function isFixtureEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (FIXTURE_EMAILS.has(normalized)) return true;
  const at = normalized.lastIndexOf('@');
  if (at < 0) return false;
  const domain = normalized.slice(at + 1);
  return FIXTURE_DOMAIN_PATTERNS.some((pattern) => pattern.test(domain));
}

/** True when the invoice's status is a paid/settled state. */
function isPaidStatus(status: string | null | undefined): boolean {
  if (typeof status !== 'string') return false;
  return PAID_STATUSES.has(status.trim().toLowerCase());
}

/** Numeric amount, accepting numeric strings; 0 for anything unparseable or negative. */
function toAmount(amount: number | string | null | undefined): number {
  if (typeof amount === 'number') return Number.isFinite(amount) && amount > 0 ? amount : 0;
  if (typeof amount !== 'string') return 0;
  const parsed = Number(amount.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * True when the invoice names a *real* customer: it carries an email and it is not a
 * fixture. A missing/blank email carries no identifiable signal either way, so it never
 * counts as revenue and never rescues a corpus from being classified as test-only.
 */
function hasRealCustomerSignal(invoice: InvoiceLike): boolean {
  const email = normalizeEmail(invoice.email);
  return email !== null && !isFixtureEmail(email);
}

/** Distinct real (non-fixture) customers — a fixture-only corpus yields 0 regardless of size. */
export function distinctRealCustomers(invoices: readonly InvoiceLike[]): number {
  const seen = new Set<string>();
  for (const invoice of invoices) {
    const email = normalizeEmail(invoice.email);
    if (email !== null && !isFixtureEmail(email)) seen.add(email);
  }
  return seen.size;
}

/**
 * Sum of `amount` for real customers in a paid/settled state only. Fixture
 * invoices and non-settled invoices contribute nothing.
 */
export function sumRealRevenue(invoices: readonly InvoiceLike[]): number {
  let total = 0;
  for (const invoice of invoices) {
    if (!hasRealCustomerSignal(invoice)) continue;
    if (!isPaidStatus(invoice.status)) continue;
    total += toAmount(invoice.amount);
  }
  return total;
}

/** True when every invoice in the corpus is from a fixture email (or the corpus is empty). */
export function corpusIsTestOnly(invoices: readonly InvoiceLike[]): boolean {
  if (invoices.length === 0) return true;
  return invoices.every((invoice) => !hasRealCustomerSignal(invoice));
}

/**
 * Throws when the corpus carries no real revenue signal. Callers that compute MRR,
 * ARR, or dashboards must call this first so test residue fails loudly instead of
 * laundering into a growth narrative.
 */
export function assertNotFixtureCorpus(invoices: readonly InvoiceLike[]): void {
  if (corpusIsTestOnly(invoices)) {
    throw new Error(
      `Refusing to compute revenue from a fixture-only invoice corpus (${invoices.length} invoice(s), ` +
        `${distinctRealCustomers(invoices)} real customer(s)). The data/invoices/ corpus is E2E test residue; ` +
        'use the authoritative revenue source (payments ledger / first-revenue evidence) instead.',
    );
  }
}

/**
 * Read `*.json` files from a directory into `InvoiceLike[]`. Unparseable and non-object
 * files are skipped, never fatal: the reader degrades so callers get whatever signal exists.
 */
export function readInvoiceCorpus(dirPath: string): InvoiceLike[] {
  if (!existsSync(dirPath)) return [];
  let names: string[];
  try {
    names = readdirSync(dirPath);
  } catch {
    return [];
  }

  const invoices: InvoiceLike[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dirPath, name), 'utf-8'));
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        invoices.push(parsed as InvoiceLike);
      }
    } catch {
      /* skip unparseable/corrupt files */
    }
  }
  return invoices;
}
