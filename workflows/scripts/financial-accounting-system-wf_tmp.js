export const meta = {
  name: 'financial-accounting-system',
  description: 'Implement complete financial accounting: Chart of Accounts, Journal Entries, Trial Balance, Bank Rec, Revenue Recognition, SOX',
  phases: [
    { title: 'Accounting Planning', detail: 'Design data model, CoA structure, compliance' },
    { title: 'Chart of Accounts', detail: 'Implement CoA service with multi-tenant support' },
    { title: 'Journal Entries', detail: 'Double-entry bookkeeping, transaction recording' },
    { title: 'Trial Balance & Bank Rec', detail: 'Trial balance generator, bank reconciliation' },
    { title: 'Revenue Recognition', detail: 'ASC 606 compliance, revenue scheduling' },
    { title: 'SOX & Audit', detail: 'Audit export CLI, SOX controls, testing' },
    { title: 'Sign-off', detail: 'CPA review, production deployment' },
  ],
};

phase('Accounting Planning');
const planning = await agent('Financial Accounting Plan', {
  label: 'accounting-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan financial accounting system. Tasks #56-64.

Scope:
- Chart of Accounts (CoA)
- Journal Entries (double-entry)
- Trial Balance
- Bank Reconciliation
- Revenue Recognition (ASC 606)
- SOX Controls & Audit Export

Requirements: GAAP compliance, multi-tenant isolation, audit trail.

Create plan in ./plans/financial-accounting/plan.md with data model, API design, compliance matrix, implementation order.

Work context: /Users/macbook/algo-trader
Reports: /Users/macbook/algo-trader/plans/reports/
`,
});

phase('Chart of Accounts');
const coa = await parallel([
  () => agent('Implement Chart of Accounts', {
    label: 'coa-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement Chart of Accounts system.

Standard CoA codes: Assets 1000-1999, Liabilities 2000-2999, Equity 3000-3999, Revenue 4000-4999, Expenses 5000-5999.

Features: CRUD API, default template, hierarchy, validation, import/export.

Files: database/migrations/coa_tables.sql, src/services/coa.service.ts, src/api/accounting/coa.routes.ts, config/default-coa.json, tests/services/coa.test.ts

Work context: /Users/macbook/algo-trader
`,
  }),
  () => agent('Test Chart of Accounts', {
    label: 'coa-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test CoA: CRUD, validation, hierarchy, default template, multi-tenant isolation, audit log.`,
  }),
]);

phase('Journal Entries');
const journal = await parallel([
  () => agent('Implement Journal Entry Service', {
    label: 'journal-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement double-entry journal entry service.

Core: debits = credits validation, posting, reversal, auto-generation from events (trades, fees, subscriptions).

Files: database/migrations/journal_entries.sql, src/services/journal-entry.service.ts, src/api/accounting/journal.routes.ts, src/events/accounting-handlers.ts, tests/services/journal-entry.test.ts
`,
  }),
  () => agent('Test Journal Entries', {
    label: 'journal-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test journal entries: balanced validation, posting, reversal, auto-generation from events, running balance, multi-tenant isolation, audit trail.`,
  }),
]);

phase('Trial Balance & Bank Rec');
const trialBank = await parallel([
  () => agent('Implement Trial Balance Generator', {
    label: 'trial-balance-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement trial balance generator with period locking.

API: GET /api/v1/accounting/trial-balance?start_date=&end_date=

Files: src/services/trial-balance.service.ts, src/services/accounting-period.service.ts, src/api/accounting/reports.routes.ts, tests/services/trial-balance.test.ts
`,
  }),
  () => agent('Implement Bank Reconciliation', {
    label: 'bank-rec-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement bank reconciliation: statement import, auto-matching, manual match, dashboard.

Files: database/migrations/bank_reconciliation.sql, src/services/bank-reconciliation.service.ts, src/api/accounting/reconciliation.routes.ts, tests/services/bank-reconciliation.test.ts
`,
  }),
]);

phase('Revenue Recognition');
const revenue = await parallel([
  () => agent('Implement Revenue Recognition', {
    label: 'revenue-rec-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement ASC 606 revenue recognition.

Performance obligations, allocation by SSP, recognition timing (SaaS straight-line, services over time), automated monthly close.

Files: database/migrations/revenue_recognition.sql, src/services/revenue-recognition.service.ts, src/api/accounting/revenue.routes.ts, tests/services/revenue-recognition.test.ts
`,
  }),
  () => agent('Test Revenue Recognition', {
    label: 'revenue-rec-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test revenue recognition: subscription, multi-obligation, quarterly billing, mid-month upgrade, cancellation, monthly close automation.`,
  }),
]);

phase('SOX & Audit');
const sox = await parallel([
  () => agent('SOX Controls Documentation', {
    label: 'sox-docs-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Create SOX controls documentation and enforcement.

Controls: access management, change management, journal approval, revenue review, bank rec segregation.

Files: docs/sox-controls.md, docs/sox-control-matrix.csv, src/services/sox-enforcement.ts
`,
  }),
  () => agent('Execute Controls Testing', {
    label: 'sox-testing',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test SOX controls: access reviews, change management audit, journal entry approval enforcement, revenue review, bank rec completion. Generate test workpapers.`,
  }),
  () => agent('Build Audit Export CLI', {
    label: 'audit-cli-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Build audit package export CLI for external auditors.

CLI: algotrader-audit export --tenant-id <id> --period <YYYY-MM> --output <dir>

Exports all financial data: CoA, journal entries, trial balance, ledger, bank rec, revenue schedules, control logs. ZIP package.

Files: scripts/audit-export.js, src/services/audit-export.service.ts, tests/audit-export.test.js
`,
  }),
]);

phase('Documentation & Sign-off');
const docs = await parallel([
  () => agent('Create Financial Docs', {
    label: 'accounting-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Create accounting documentation: system overview, CoA, journal entries, revenue recognition, bank rec, audit export, SOX compliance. Update API docs, CHANGELOG.`,
  }),
  () => agent('Accounting Sign-off', {
    label: 'accounting-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Final sign-off for financial accounting.

Review all 7 phases. Decision: PRODUCTION DEPLOY or BLOCK.

Return: Sign-off report.
`,
  }),
]);

log('Financial Accounting workflow launched');