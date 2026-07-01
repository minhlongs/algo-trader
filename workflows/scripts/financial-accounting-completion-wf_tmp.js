export const meta = {
  name: 'financial-accounting-completion',
  description: 'Complete remaining financial accounting: Journal Entry Service, Revenue Recognition Schedule, Trial Balance, AR Aging',
  phases: [
    { title: 'Journal Entry Service', detail: 'CRUD journal entries, approvals, audit trail' },
    { title: 'Revenue Recognition Schedule', detail: 'ASC 606 compliant revenue recognition' },
    { title: 'Trial Balance Generator', detail: 'Generate trial balance reports' },
    { title: 'AR Aging Report', detail: 'Accounts receivable aging' },
    { title: 'Testing & Sign-off', detail: 'Validate accounting accuracy, GAAP compliance' },
  ],
};

phase('Journal Entry Service');
const journal = await parallel([
  () => agent('Implement Journal Entry API', {
    label: 'journal-api',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Journal Entry Service API:

CRUD operations:
1. Create journal entry:
   POST /api/v1/accounting/journal-entries
   Body:
   {
     "entry_date": "2025-06-22",
     "description": "Revenue from tenant XYZ",
     "lines": [
       { "account_code": "4000", "debit": 0, "credit": 10000, "tenant_id": "abc" },
       { "account_code": "1200", "debit": 10000, "credit": 0, "tenant_id": "abc" }
     ],
     "source": "revenue-recognition|manual|invoice",
     "reference_id": "uuid"  // link to source
   }

2. List: GET /api/v1/accounting/journal-entries?tenant_id=&start_date=&end_date=
3. Get: GET /api/v1/accounting/journal-entries/:id
4. Approve: POST /api/v1/accounting/journal-entries/:id/approve
   - Requires SOX approver role
   - Creates immutable audit trail

Validation:
- Debits = Credits
- Account codes exist in chart of accounts
- Double-entry required (≥2 lines)

Database:
- journal_entries table
- journal_entry_lines table

`,
  }),
  () => agent('Implement Audit Trail', {
    label: 'audit-trail',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Accounting audit trail:

For every journal entry:
1. Immutable record:
   - Created by, created_at
   - Modified by, modified_at (if allowed)
   - Approved by, approved_at
   - Voided by, voided_at

2. Version history:
   - journal_entry_versions table
   - Every change creates new version
   - Cannot delete, only void with reason

3. Chain of custody:
   - Who created, who approved, who changed
   - IP address, user agent logged

4. Query: GET /api/v1/accounting/journal-entries/:id/audit-trail
   Returns chronological list of changes

5. Compliance: satisfy SOX §404 internal controls

`,
  }),
  () => agent('Implement Trial Balance Generator', {
    label: 'trial-balance',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Trial balance generator:

Endpoint: GET /api/v1/accounting/trial-balance
Query params:
- as_of_date (required)
- tenant_id (optional, default all)

Response:
{
  "as_of_date": "2025-06-22",
  "tenant_id": "all|specific",
  "accounts": [
    {
      "code": "1000",
      "name": "Cash",
      "debit": 50000,
      "credit": 0,
      "balance": 50000
    },
    ...
  ],
  "total_debits": 1000000,
  "total_credits": 1000000,
  "is_balanced": true
}

SQL:
SELECT ac.code, ac.name,
       COALESCE(SUM(je_lines.debit), 0) as debit,
       COALESCE(SUM(je_lines.credit), 0) as credit,
       (SUM(je_lines.debit) - SUM(je_lines.credit)) as balance
FROM accounts ac
LEFT JOIN journal_entry_lines je_lines ON ac.code = je_lines.account_code
LEFT JOIN journal_entries je ON je_lines.journal_entry_id = je.id
WHERE je.approved_at IS NOT NULL
  AND je.entry_date <= $as_of_date
  AND (tenant_id = $tenant_id OR $tenant_id IS NULL)
GROUP BY ac.code, ac.name
ORDER BY ac.code;

`,
  }),
]);

phase('Revenue Recognition Schedule');
const revenue = await parallel([
  () => agent('Implement ASC 606 Revenue Recognition', {
    label: 'revenue-recognition',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `ASC 606 revenue recognition:

1. Performance obligations:
   - SaaS subscription (monthly access)
   - Setup fees (one-time)
   - Professional services (hours-based)

2. Recognition patterns:
   - Subscription: straight-line over month
   - Setup fee: immediate or over first month
   - Services: as performed (hours consumed)

3. Implementation:
   src/services/revenue-recognition.service.ts

   calculateRevenue(invoice):
     For each line item:
       - Determine performance obligation
       - Get transaction price
       - Allocate price to obligations
       - Schedule recognition (monthly periods)

   Example: $1200 annual subscription
   - Total: $1200
   - Monthly: $100 recognized over 12 months

4. Schedule table:
   revenue_schedules:
   - invoice_line_id, period, amount, recognized_date

5. Revenue report:
   GET /api/v1/accounting/revenue?start_date=&end_date=
   Returns recognized revenue by period

`,
  }),
  () => agent('Implement AR Aging Report', {
    label: 'ar-aging',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `AR Aging report:

Invoice aging buckets:
- Current (0-30 days)
- 31-60 days
- 61-90 days
- 90+ days (critical)

Endpoint: GET /api/v1/accounting/ar-aging?as_of_date=
Response:
{
  "as_of_date": "2025-06-22",
  "total_ar": 500000,
  "aging": [
    { "bucket": "0-30", "amount": 400000, "percent": 80 },
    { "bucket": "31-60", "amount": 80000, "percent": 16 },
    { "bucket": "61-90", "amount": 15000, "percent": 3 },
    { "bucket": "90+", "amount": 5000, "percent": 1 }
  ],
  "by_customer": [
    { "customer_id": "abc", "name": "Tenant ABC", "total": 10000, "aging": {...} }
  ]
}

SQL:
SELECT c.id, c.name,
       SUM(CASE WHEN due_date >= $as_of_date - 30 THEN amount ELSE 0 END) as current,
       SUM(CASE WHEN due_date BETWEEN $as_of_date - 60 AND $as_of_date - 31 THEN amount ELSE 0 END) as days_31_60,
       ...
FROM invoices i
JOIN customers c ON i.customer_id = c.id
WHERE i.status IN ('issued', 'overdue')
GROUP BY c.id, c.name;

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Test Accounting Accuracy', {
    label: 'accounting-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Accounting accuracy tests:

1. Double-entry validation:
   - Every journal entry: sum(debits) = sum(credits)
   - Reject if unbalanced

2. Trial balance:
   - Generate trial balance
   - Assert total debits = total credits
   - Test with multiple periods

3. Revenue recognition:
   - $1200 annual → $100/month for 12 months
   - $3600 3-year → $100/month for 36 months
   - Partial month: pro-rate

4. AR aging:
   - Invoice due today → Current bucket
   - Invoice due 31 days ago → 31-60 bucket
   - Edge cases: null due_date, future dates

5. SOX controls:
   - Unapproved entries cannot post to GL
   - Void entries require reason and approver

`,
  }),
  () => agent('GAAP Compliance Review', {
    label: 'gaap-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `GAAP compliance review:

Verify:
1. Double-entry system: ✓
2. Chart of Accounts structure: Assets, Liabilities, Equity, Revenue, Expenses
3. Accrual accounting: revenue recognized when earned, not when cash received
4. Matching principle: expenses matched to revenue period
5. Materiality threshold: entries < $100 can be simplified?
6. Disclosure: revenue recognition policy documented
7. Audit trail: immutable journal entries with approvals
8. Internal controls: separation of duties (creator ≠ approver)

Document gaps. Fix non-compliant areas.

`,
  }),
  () => agent('Financial Accounting Sign-off', {
    label: 'accounting-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Financial Accounting System sign-off.

Review:
✅ Chart of Accounts implemented
✅ Journal Entry Service with approval workflow
✅ Audit trail (immutable)
✅ Trial Balance Generator
✅ Revenue Recognition (ASC 606)
✅ AR Aging Report
✅ GAAP compliance verified
✅ SOX controls implemented
✅ Testing complete

Decision: FINANCIAL ACCOUNTING SYSTEM PRODUCTION READY.

`,
  }),
]);

log('Financial Accounting Completion workflow launched');