# Track C — Revenue-Corpus Guard

**Date:** 2026-10-21
**Status:** Complete — 19/19 tests green, `tsc --noEmit` 0 errors
**Files owned:** `src/platform/billing/revenue-source-of-truth.ts` (new, 178 LOC),
`src/platform/billing/__tests__/revenue-source-of-truth.test.ts` (new, 201 LOC)

---

## Why this guard exists — the hazard, with numbers

`/Users/macbook/algo-trader/data/invoices/` contains **16,356 JSON invoice files (64 MB)**, every
one written by production code (`src/platform/api/routes/webhooks/handlers/payment-handler.ts` →
`generateInvoice(...)` in `src/platform/billing/invoice-generator.ts:14`, which targets
`join(process.cwd(), 'data', 'invoices')`).

Full-corpus audit (all 16,356 files parsed):

| Fact | Value |
|---|---|
| Files | 16,356 |
| Distinct `status` values | **1** — every file is `"paid"` |
| Distinct email addresses | **6**, all test fixtures |
| Naive `amount` sum | **$2,221,480** |
| Annualised | **$26,657,760 ARR** |
| Real customers | **0** |
| Authoritative MRR (`state/evidence/first-revenue.json`) | **0** |

The six fixture addresses, with file counts:

| Email | Files |
|---|---|
| `e2e-customer@test.com` | 15,432 |
| `a@b.com` | 610 |
| `invoice-test@example.com` | 305 |
| `user&test@example.com` | 3 |
| `curr@example.com` | 3 |
| `fail@example.com` | 3 |

**Why it is dangerous:** this is an Open-Core / RaaS repository whose stated goal is $1M MRR, and
`payment-handler.ts` writes into this directory *unconditionally* on every NOWPayments IPN
success — including E2E test runs. The corpus is gitignored (`.gitignore:7` → `/data/`) and
untracked (`git ls-files data/invoices/` = 0), so it never appeared in review. Any dashboard,
investor deck, gate check, or `/idea` pipeline step that rolled up this directory would convert
E2E residue into a **$26.7M ARR growth narrative from zero paying customers**. That is not a
metric error — it is a fabricated business claim, and it would survive review because the files
look like invoices, carry `status: "paid"`, and sum to a precise real number.

The module below makes laundering impossible by construction: revenue and customer counts must
pass through these functions, and a corpus with no real customers *throws* rather than reporting
a number.

---

## Module API — `src/platform/billing/revenue-source-of-truth.ts`

| Export | Behaviour |
|---|---|
| `FIXTURE_EMAILS: ReadonlySet<string>` | The six corpus addresses. Explicit denylist so the exact E2E residue is recognisable, not merely "suspicious". |
| `FIXTURE_DOMAIN_PATTERNS` (private) | `example.com`, `example.org`, `example.net`, `test.com`, `.test` TLD, `invalid`. Catches a future fixture that invents a new local part at a reserved domain. |
| `isFixtureEmail(email)` | Case-insensitive, trims whitespace. True for a denylisted address **or** any reserved-domain address. |
| `distinctRealCustomers(invoices)` | Distinct non-fixture emails. Fixture corpus → **0**. |
| `sumRealRevenue(invoices)` | Sums `amount` only where the email is real **and** status is a paid state. Fixture corpus → **$0**. |
| `PAID_STATUSES` (private) | `paid`, `settled`, `succeeded`, `success`, `complete`, `completed`, `finished`. Everything else (`failed`, `pending`, `refunded`, `expired`, unknown) is not revenue. |
| `corpusIsTestOnly(invoices)` | True when no invoice names a real customer (and for an empty corpus). |
| `assertNotFixtureCorpus(invoices)` | **Throws** on a test-only corpus, naming the invoice and real-customer counts. |
| `readInvoiceCorpus(dirPath)` | Sync `readdirSync` + `JSON.parse` of `*.json`; skips unparseable/non-object files; returns `[]` for a missing or unreadable dir. Matches `invoice-generator.ts`'s `node:fs` sync style. |
| `InvoiceLike` | Narrow input: `{ email?: string \| null; status?: string \| null; amount?: number \| string \| null }` — works on the on-disk invoice JSON and parsed variants. No `any`. |

**Design decision worth flagging:** an invoice with a missing or blank email is treated as
carrying *no* signal — it is neither revenue nor proof of a real customer. This was a real bug I
found in my first draft: originally `null` emails counted as real, which meant a corpus of
email-less invoices could be laundered through `corpusIsTestOnly`.

**Known residual (documented, not a defect):** a malformed but non-fixture email string such as
`not-an-email` is treated as a real customer. The guard is a fixture *denylist*, not an RFC 5322
validator — validating strictly risks rejecting a legitimate future email format and silently
under-counting genuine paying customers, which is the worse failure mode. This is pinned by a
test so the behaviour is deliberate rather than accidental.

---

## Test results — `__tests__/revenue-source-of-truth.test.ts`

Synthetic `InvoiceLike[]` fixtures only; the 64 MB corpus is never read in a unit test. One
optional probe reads the real corpus **only if present** (self-skips in a fresh clone where the
gitignored directory is absent), asserting `sumRealRevenue → 0`, `distinctRealCustomers → 0`,
`corpusIsTestOnly → true`, and that `assertNotFixtureCorpus` throws.

```
npx tsc --noEmit                                               → 0 errors
npx vitest run src/platform/billing/__tests__/revenue-source-of-truth.test.ts
      Test Files  1 passed (1)
      Tests      19 passed (19)
npx vitest run src/platform/billing/__tests__/                 → 19 files, 151 tests passed
```

Coverage: all-fixture corpus · mixed corpus · empty corpus · null/blank/malformed email ·
mixed-case · whitespace · unknown status · numeric-string amounts · negative and non-finite
amounts · missing status · missing directory · real-corpus probe.

The key assertions from the spec, as implemented:

```ts
expect(distinctRealCustomers(CORPUS_FIXTURE_INVOICES)).toBe(0);
expect(sumRealRevenue(CORPUS_FIXTURE_INVOICES)).toBe(0);

const naive = CORPUS_FIXTURE_INVOICES.reduce((a, i) => a + (i.amount ?? 0), 0);
expect(naive).toBe(1643);      // the hazard, demonstrated on the same records
expect(naive).toBeGreaterThan(0);

expect(() => assertNotFixtureCorpus(CORPUS_FIXTURE_INVOICES)).toThrow(/fixture-only invoice corpus/);
expect(() => assertNotFixtureCorpus([...fixtures, { email: 'buyer@cashclaw.io', ... }])).not.toThrow();
```

---

## Does anything in the repo currently roll up `data/invoices/`?

**No. Grepped repo-wide (`.ts`, `.js`, `.mjs`, `.sh`), excluding `data/` itself and my new module.**

- `src/platform/billing/invoice-generator.ts:14,34,108` — the **writer**. Defines `INVOICE_DIR`,
  `ensureDir()`, writes `${invoiceId}.json` on payment success, `listInvoices()` reads the dir.
- `grep -rn "readInvoiceCorpus\|listInvoices"` → **`listInvoices()` has zero production callers**,
  and nothing outside `invoice-generator.ts` and the test suite references the directory at all.
- No MRR / ARR / revenue / customer-count computation reads the corpus. Revenue is computed from
  the payments ledger and licenses (`src/platform/billing/revenue-analytics.ts`,
  `revenue-license-metrics.ts`, `payment-service.ts`), never from invoice files.
- Other "invoice" hits are unrelated DB tables (`overage_invoices`,
  `027-usage-metering-schema.ts`) and comments.

**Finding: no caller currently computes a bogus MRR from this corpus.** The hazard is *latent*
rather than live — nothing feeds on it today, which is exactly why it was never noticed. The
guard closes the path before anyone builds the first dashboard or deck step that would.

**The live write path is still exposed, and that is the actionable part:** `payment-handler.ts`
calls `generateInvoice()` on every IPN success with no fixture check, so 16k files of test
residue exist in the first place. That is out of my scope (Track C owns two new files); flagging
it for the plan owner as a follow-up — the long-term fix is to not write fixture invoices at all,
not merely to filter them at read time.

**Not touched, by design:** `data/invoices/` is left exactly as found. It is 64 MB of gitignored
residue and deleting it is destructive, requiring the user's decision. The module makes it
harmless; it does not remove it.

---

## Open questions

1. **Malformed emails fail open.** `not-an-email` counts as a real customer (see design note).
   Acceptable for a denylist guard, but if a stricter customer definition is wanted, add regex
   validation — it should be an explicit product decision, not a silent behaviour.
2. **The write path is unfixed.** `payment-handler.ts` still writes fixture invoices on IPN
   success. Out of Track C's scope; the residual 16k files keep growing until addressed.
3. **Corpus deletion is a user decision.** Should the 16k files be deleted, or retained as
   evidence with the guard in place? Recommend retaining — the guard makes them inert, and the
   corpus documents what the E2E suite actually exercises.
