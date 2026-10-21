/**
 * Revenue Source of Truth — fixture-corpus guard tests
 *
 * Synthetic InvoiceLike arrays only; the real 16k-file corpus is never read here
 * (slow, and its contents are already asserted by the fixture denylist).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  FIXTURE_EMAILS,
  InvoiceLike,
  assertNotFixtureCorpus,
  corpusIsTestOnly,
  distinctRealCustomers,
  isFixtureEmail,
  readInvoiceCorpus,
  sumRealRevenue,
} from '../revenue-source-of-truth';

/** The six email addresses actually present in data/invoices/. */
const CORPUS_FIXTURE_INVOICES: InvoiceLike[] = [
  { email: 'e2e-customer@test.com', status: 'paid', amount: 99 },
  { email: 'e2e-customer@test.com', status: 'paid', amount: 49 },
  { email: 'a@b.com', status: 'paid', amount: 49 },
  { email: 'invoice-test@example.com', status: 'paid', amount: 299 },
  { email: 'user&test@example.com', status: 'paid', amount: 999 },
  { email: 'curr@example.com', status: 'paid', amount: 49 },
  { email: 'fail@example.com', status: 'paid', amount: 99 },
];

describe('isFixtureEmail', () => {
  it('matches every email address found in the invoice corpus', () => {
    for (const email of FIXTURE_EMAILS) {
      expect(isFixtureEmail(email)).toBe(true);
    }
    expect(FIXTURE_EMAILS.size).toBe(6);
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(isFixtureEmail('  E2E-Customer@Test.com  ')).toBe(true);
    expect(isFixtureEmail('\tA@B.COM\n')).toBe(true);
    expect(isFixtureEmail('Invoice-Test@Example.COM')).toBe(true);
  });

  it('matches fixture domains beyond the known denylist', () => {
    expect(isFixtureEmail('somebody-else@example.com')).toBe(true);
    expect(isFixtureEmail('someone@example.org')).toBe(true);
    expect(isFixtureEmail('thing@foo.test')).toBe(true);
    expect(isFixtureEmail('thing@invalid')).toBe(true);
  });

  it('does not treat a genuine customer address as a fixture', () => {
    expect(isFixtureEmail('real.customer@gmail.com')).toBe(false);
    expect(isFixtureEmail('buyer@cashclaw.io')).toBe(false);
    expect(isFixtureEmail('notatest@mycompany.com')).toBe(false);
  });
});

describe('distinctRealCustomers', () => {
  it('returns 0 for the fixture-only corpus despite many invoices', () => {
    expect(distinctRealCustomers(CORPUS_FIXTURE_INVOICES)).toBe(0);
  });

  it('counts distinct real emails, case- and whitespace-insensitively', () => {
    const mixed: InvoiceLike[] = [
      ...CORPUS_FIXTURE_INVOICES,
      { email: 'buyer@cashclaw.io', status: 'paid', amount: 99 },
      { email: ' Buyer@CashClaw.io ', status: 'paid', amount: 99 },
      { email: 'second@proton.me', status: 'paid', amount: 299 },
    ];
    expect(distinctRealCustomers(mixed)).toBe(2);
  });

  it('returns 0 for an empty corpus', () => {
    expect(distinctRealCustomers([])).toBe(0);
  });
});

describe('sumRealRevenue', () => {
  it('returns 0 for the all-paid fixture corpus that naively sums to a large number', () => {
    expect(sumRealRevenue(CORPUS_FIXTURE_INVOICES)).toBe(0);

    // The hazard this guard prevents: a naive roll-up of the same records.
    const naive = CORPUS_FIXTURE_INVOICES.reduce((acc, inv) => acc + (inv.amount ?? 0), 0);
    expect(naive).toBe(1643);
    expect(naive).toBeGreaterThan(0);
  });

  it('sums real paid invoices and skips fixtures and unsettled statuses', () => {
    const mixed: InvoiceLike[] = [
      { email: 'buyer@cashclaw.io', status: 'paid', amount: 99 },
      { email: 'buyer@cashclaw.io', status: 'paid', amount: 299 },
      { email: 'other@proton.me', status: 'succeeded', amount: 49 },
      { email: 'e2e-customer@test.com', status: 'paid', amount: 999 },
      { email: 'buyer@cashclaw.io', status: 'failed', amount: 500 },
      { email: 'buyer@cashclaw.io', status: 'pending', amount: 500 },
      { email: 'buyer@cashclaw.io', status: 'refunded', amount: 500 },
      { email: 'buyer@cashclaw.io', status: 'expired', amount: 500 },
      { email: 'buyer@cashclaw.io', status: 'totally-unknown-status', amount: 500 },
    ];
    expect(sumRealRevenue(mixed)).toBe(447);
  });

  it('accepts amount as a number or numeric string and ignores unusable values', () => {
    const invoices: InvoiceLike[] = [
      { email: 'buyer@cashclaw.io', status: 'paid', amount: '99' },
      { email: 'buyer@cashclaw.io', status: 'paid', amount: ' 299 ' },
      { email: 'buyer@cashclaw.io', status: 'paid', amount: 'abc' },
      { email: 'buyer@cashclaw.io', status: 'paid', amount: null },
      { email: 'buyer@cashclaw.io', status: 'paid', amount: undefined },
      { email: 'buyer@cashclaw.io', status: 'paid', amount: -50 },
      { email: 'buyer@cashclaw.io', status: 'paid', amount: 1 },
    ];
    expect(sumRealRevenue(invoices)).toBe(399);
  });

  it('returns 0 for an empty corpus and for invoices with no status', () => {
    expect(sumRealRevenue([])).toBe(0);
    expect(sumRealRevenue([{ email: 'buyer@cashclaw.io', amount: 99 }])).toBe(0);
    expect(sumRealRevenue([{ email: 'buyer@cashclaw.io', status: null, amount: 99 }])).toBe(0);
    // An invoice with no email names no real customer, so it is not revenue either.
    expect(sumRealRevenue([{ email: null, status: 'paid', amount: 99 }])).toBe(0);
    expect(sumRealRevenue([{ status: 'paid', amount: 99 }])).toBe(0);
  });
});

describe('unusable records', () => {
  it('excludes records that name no customer at all', () => {
    const nameless: InvoiceLike[] = [
      { email: null, status: 'paid', amount: 99 },
      { email: '   ', status: 'paid', amount: 99 },
      { status: 'paid', amount: 99 },
    ];
    expect(sumRealRevenue(nameless)).toBe(0);
    expect(distinctRealCustomers(nameless)).toBe(0);
    expect(corpusIsTestOnly(nameless)).toBe(true);
    expect(() => assertNotFixtureCorpus(nameless)).toThrow();
  });

  it('treats a malformed but non-fixture email string as real signal (fail-open, never under-counts a paying customer)', () => {
    const malformed: InvoiceLike[] = [{ email: 'not-an-email', status: 'paid', amount: 99 }];
    expect(isFixtureEmail('not-an-email')).toBe(false);
    expect(sumRealRevenue(malformed)).toBe(99);
    expect(corpusIsTestOnly(malformed)).toBe(false);
    // Deliberately NOT validated as a well-formed address: the guard is a denylist of
    // known fixture residue, not an RFC validator. See open question in the evidence doc.
  });
});

describe('corpusIsTestOnly', () => {
  it('is true for the fixture corpus and for an empty corpus', () => {
    expect(corpusIsTestOnly(CORPUS_FIXTURE_INVOICES)).toBe(true);
    expect(corpusIsTestOnly([])).toBe(true);
    expect(corpusIsTestOnly([{ email: null, status: 'paid', amount: 99 }])).toBe(true);
  });

  it('is false as soon as one real customer invoice is present', () => {
    expect(corpusIsTestOnly([...CORPUS_FIXTURE_INVOICES, { email: 'buyer@cashclaw.io', status: 'paid', amount: 99 }])).toBe(false);
  });
});

describe('assertNotFixtureCorpus', () => {
  it('throws on an all-fixture corpus so bogus MRR cannot be computed', () => {
    expect(() => assertNotFixtureCorpus(CORPUS_FIXTURE_INVOICES)).toThrow(/fixture-only invoice corpus/);
    expect(() => assertNotFixtureCorpus([])).toThrow();
  });

  it('does not throw when a real email is present', () => {
    const mixed: InvoiceLike[] = [...CORPUS_FIXTURE_INVOICES, { email: 'buyer@cashclaw.io', status: 'paid', amount: 99 }];
    expect(() => assertNotFixtureCorpus(mixed)).not.toThrow();
  });
});
