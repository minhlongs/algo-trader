/**
 * Revenue Source of Truth — on-disk corpus reader tests
 *
 * Split from revenue-source-of-truth.test.ts to keep both files small. The real
 * corpus is gitignored E2E residue (~16k files, 64 MB), so the probe self-skips on
 * a fresh clone instead of depending on it.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertNotFixtureCorpus,
  corpusIsTestOnly,
  distinctRealCustomers,
  readInvoiceCorpus,
  sumRealRevenue,
} from '../revenue-source-of-truth';

describe('readInvoiceCorpus', () => {
  const corpusDir = join(process.cwd(), 'data', 'invoices');

  it('returns an empty array for a directory that does not exist', () => {
    expect(readInvoiceCorpus('/definitely/not/a/real/invoice/dir')).toEqual([]);
  });

  it('parses the on-disk invoice JSON shape when the corpus is present', () => {
    // Optional probe: data/invoices/ is gitignored E2E residue, absent in a fresh
    // clone, so this test self-skips rather than depending on 64 MB of fixtures.
    if (!existsSync(corpusDir)) return;
    const first = (readdirSync(corpusDir) as string[]).filter((f) => f.endsWith('.json'))[0];
    if (!first) return;

    const corpus = readInvoiceCorpus(corpusDir);
    expect(corpus.length).toBeGreaterThan(0);
    expect(typeof corpus[0].email).toBe('string');
    expect(typeof corpus[0].status).toBe('string');
    // Whatever volume the corpus holds, none of it is real revenue and none of its
    // emails are real customers.
    expect(sumRealRevenue(corpus)).toBe(0);
    expect(distinctRealCustomers(corpus)).toBe(0);
    expect(corpusIsTestOnly(corpus)).toBe(true);
    expect(() => assertNotFixtureCorpus(corpus)).toThrow();
  });
});
