export const meta = {
  name: 'legal-compliance-system',
  description: 'Implement legal/compliance system: Reg D offering docs, ROFR, IP protection, employment contracts, data privacy',
  phases: [
    { title: 'Legal Compliance Planning', detail: 'Requirements: Reg D, ROFR, IP, employment, data privacy, GDPR' },
    { title: 'Reg D & Offering Docs', detail: 'Reg D 506(c) documents, investor questionnaire, accreditation' },
    { title: 'ROFR & Assignment', detail: 'Right of First Refusal, assignment agreements' },
    { title: 'IP Protection', detail: 'IP assignment, employee invention agreements, contributor license' },
    { title: 'Data Privacy & GDPR', detail: 'Privacy policy, DPA, consent management, data subject rights' },
    { title: 'Employment & Contractor', detail: 'Employment contracts, contractor agreements, NDAs' },
    { title: 'Document Management', detail: 'Contract storage, versioning, e-signature integration' },
    { title: 'Testing & Sign-off', detail: 'Compliance review, legal sign-off' },
  ],
};

phase('Planning');
const planning = await agent('Legal Compliance Plan', {
  label: 'legal-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan legal/compliance system. Task #107.

Requirements:
- Reg D 506(c) offering documents
- ROFR (Right of First Refusal) for share transfers
- IP protection (assignment, confidentiality)
- Data privacy (GDPR, CCPA, privacy policy, DPA)
- Employment & contractor agreements
- Compliance tracking and document management

Create plan in ./plans/legal-compliance/plan.md.

Work context: /Users/macbook/algo-trader
`,
});

phase('Reg D & Offering Docs');
const regD = await parallel([
  () => agent('Implement Reg D Offering Documents', {
    label: 'regd-docs-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement Reg D 506(c) offering document management.

Documents:
1. Private Placement Memorandum (PPM)
2. Investor Questionnaire
3. Accreditation Verification Form
4. Subscription Agreement
5. Operating Agreement (LLC) or Bylaws (Corp)

Implementation:
- src/legal/regd/ppm.service.ts (template management)
- src/legal/regd/investor-verification.service.ts
- API: POST /api/v1/legal/regd/verify-accreditation
- Database: investor_applications, accreditation_documents

Files: src/legal/regd/*, database/migrations/regd_tables.sql, tests/legal/regd/*.test.ts
`,
  }),
  () => agent('Implement Investor Accreditation Flow', {
    label: 'accreditation-flow-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Investor accreditation verification flow:

1. Investor fills questionnaire (income, net worth, professional credentials)
2. Document upload: W-2, pay stubs, tax returns, licenses, bank statements
3. Manual review by compliance officer (admin UI)
4. Decision: approved / rejected / additional info needed
5. e-signature integration for subscription agreement
6. Record keeping: 506(c) offering records

Files: src/legal/regd/accreditation-flow.service.ts, src/admin/legal/verify-accredication.tsx
`,
  }),
]);

phase('ROFR & Assignment');
const rofr = await parallel([
  () => agent('Implement ROFR System', {
    label: 'rofr-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement Right of First Refusal (ROFR) system.

Process:
1. Shareholder proposes transfer (sale, gift) to third party
2. Company receives ROFR notice
3. Company has 30 days to exercise ROFR at fair market value
4. If not exercised, shareholder can proceed

Implementation:
- src/legal/rofr/rofr.service.ts
- API: POST /api/v1/legal/rofr/notice, POST /api/v1/legal/rofr/exercise
- Database: rofr_notices, rofr_exercises
- Notification: email to board, investor portal

Files: src/legal/rofr/*, tests/legal/rofr.test.ts
`,
  }),
  () => agent('Implement Assignment Agreements', {
    label: 'assignment-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement assignment agreement management.

Types:
1. IP Assignment: employee/contractor assigns inventions to company
2. Share Assignment: transfer of ownership interests
3. Contract Assignment: transfer of contractual rights

Templates with e-signature:
- src/legal/templates/assignment-agreement.ts
- API: POST /api/v1/legal/assignments/generate, POST /api/v1/legal/assignments/sign

`,
  }),
]);

phase('IP Protection');
const ip = await parallel([
  () => agent('Implement IP Assignment Enforcement', {
    label: 'ip-assignment-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `IP assignment enforcement:

1. Employee onboarding: IP Assignment Agreement required
2. Contractor onboarding: IP clause in contract
3. Open source: Contributor License Agreement (CLA) for external contributors
4. Trade secret protection: classification, access controls
5. Patent tracking: record inventions, track filings

Implementation:
- src/legal/ip/ip-assignment.service.ts
- CLA portal: /legal/cla
- Database: ip_assignments, patents, trade_secrets

Files: src/legal/ip/*, tests/legal/ip.test.ts
`,
  }),
  () => agent('Implement Confidentiality & NDAs', {
    label: 'nda-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement NDA management:

1. NDA templates: mutual, unilateral (company→partner)
2. NDA generation: auto-fill parties, effective date
3. E-signature integration
4. NDA repository: search, expiry alerts
5. NDA compliance tracking

Files: src/legal/nda/nda.service.ts, src/legal/templates/nda-template.ts, tests/legal/nda.test.ts
`,
  }),
]);

phase('Data Privacy & GDPR');
const privacy = await parallel([
  () => agent('Implement Privacy Policy & Consent', {
    label: 'privacy-policy-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement privacy policy and consent management.

Privacy Policy:
- Auto-generated based on data processing activities
- Versioned (e.g., v1.0 2025-01-15)
- Presented to users on signup

Consent Management:
- Record user consents (marketing, analytics, sharing)
- Withdrawal mechanism
- CCPA opt-out

Implementation:
- src/legal/privacy/privacy-policy.service.ts
- src/middleware/consent-check.ts
- Database: privacy_consents, privacy_policy_versions

`,
  }),
  () => agent('Implement GDPR Data Subject Rights', {
    label: 'gdpr-rights-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `GDPR data subject rights implementation:

1. Right to access: export all personal data (JSON)
2. Right to rectification: allow users to correct data
3. Right to erasure: delete account + data (with exceptions)
4. Right to portability: export in machine-readable format
5. Right to object: opt-out of processing

Endpoints:
- GET /api/v1/privacy/export
- POST /api/v1/privacy/rectify
- POST /api/v1/privacy/delete
- POST /api/v1/privacy/portability
- POST /api/v1/privacy/object

Files: src/legal/privacy/gdpr.service.ts, src/api/legal/privacy.routes.ts, tests/legal/gdpr.test.ts
`,
  }),
  () => agent('Implement Data Processing Agreements', {
    label: 'dpa-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Data Processing Agreement (DPA) management.

DPA for subprocessors (AWS, Cloudflare, etc.):
1. Standard Contractual Clauses (SCCs)
2. GDPR compliance certification
3. Data processing terms: security, audit rights, deletion

For customers:
1. DPA on request
2. Auto-generate with customer details
3. E-signature
4. Repository: all signed DPAs

Files: src/legal/dpa/dpa.service.ts, src/legal/templates/dpa-template.ts
`,
  }),
]);

phase('Employment & Contractor');
const employment = await parallel([
  () => agent('Implement Employment Contracts', {
    label: 'employment-contracts-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Employment contract management:

Contract templates:
- Full-time employee (at-will, with IP clause, confidentiality)
- Remote employee (jurisdiction-specific addendums)
- Executive employment agreements

Onboarding workflow:
1. HR enters employee details
2. Generate contract with e-signature
3. Employee signs
4. Store in contract repository
5. Notify payroll/benefits

Files: src/legal/employment/contract.service.ts, src/legal/templates/employment-template.ts
`,
  }),
  () => agent('Implement Contractor Agreements', {
    label: 'contractor-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Contractor agreement management:

Key clauses:
- IP assignment (work-made-for-hire)
- Confidentiality
- Independent contractor status (no employee benefits)
- Termination for convenience

Onboarding flow similar to employment but simpler.

Files: src/legal/contractor/contractor.service.ts, src/legal/templates/contractor-template.ts
`,
  }),
]);

phase('Document Management');
const docs = await parallel([
  () => agent('Implement Contract Storage & Versioning', {
    label: 'contract-storage-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Contract document storage and versioning.

Storage:
- Encrypted at rest (S3 with SSE-KMS or Cloudflare R2)
- Access logging
- Retention: keep all contracts permanently (legal hold)

Versioning:
- Each signed contract stored with immutable version
- Amendments tracked as new versions
- Audit log: who accessed, when, what changes

Search:
- Full-text search (Elasticsearch or PostgreSQL full-text)
- Filter by type, party, date range, status

Files: src/legal/document-store.service.ts, tests/legal/document-store.test.ts
`,
  }),
  () => agent('Integrate E-Signature', {
    label: 'esignature-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `E-signature integration.

Provider options: DocuSign, HelloSign, PandaDoc, or built-in (PGP signatures).

Integration:
1. Send for signature: envelope with documents, signers, signing order
2. Webhook: signature completed → callback
3. Status tracking: sent, viewed, signed, declined
4. Certificate of completion

Implementation:
- src/legal/esign/esignature.service.ts (interface)
- src/legal/esign/docusign.adapter.ts (concrete)
- API: POST /api/v1/legal/send-for-signature

Files: src/legal/esign/*, tests/legal/esign.test.ts
`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Compliance Testing', {
    label: 'compliance-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Compliance testing:

Reg D:
- Accreditation questionnaire validation
- Document upload security (virus scan, file type validation)
- 506(c) records properly stored

GDPR:
- Data export endpoint returns all personal data
- Delete request removes PII from all tables
- Consent logging works

Access control:
- Only authorized personnel access legal contracts
- Audit log records all access

`,
  }),
  () => agent('Legal Sign-off', {
    label: 'legal-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Legal compliance system sign-off.

Review:
✅ Reg D offering system
✅ ROFR workflow
✅ IP protection
✅ Data privacy (GDPR/CCPA)
✅ Employment/contractor agreements
✅ Document management
✅ E-signature integration
✅ Compliance testing

Decision: LEGAL COMPLIANCE PRODUCTION READY.

`,
  }),
]);

log('Legal & Compliance workflow launched');