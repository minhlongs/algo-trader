export const meta = {
  name: 'sox-controls-completion',
  description: 'Complete SOX 404 controls: documentation, testing, remediation, auditor evidence',
  phases: [
    { title: 'SOX Control Inventory', detail: 'Catalog all SOX-relevant controls, assess gaps' },
    { title: 'Control Documentation', detail: 'Write control narratives, RCM, test procedures' },
    { title: 'Control Testing', detail: 'Test design and operating effectiveness' },
    { title: 'Remediation Plan', detail: 'Address control deficiencies, implement fixes' },
    { title: 'Auditor Evidence Package', detail: 'Compile evidence for external auditor' },
    { title: 'Sign-off', detail: 'SOX compliance validated for year-end' },
  ],
};

phase('SOX Control Inventory');
const inventory = await agent('Inventory SOX Controls', {
  label: 'sox-inventory',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Inventory SOX controls. Tasks #63, #64.

SOX 404 requires:
- Internal control over financial reporting (ICFR)
- Management assessment of control effectiveness
- External auditor attestation

AlgoTrader financial systems to cover:
1. Revenue recognition (ASC 606)
   - Revenue contracts with tenants
   - Performance obligations (usage-based billing)
   - Variable consideration
   - Timing of revenue recognition

2. Billing and collections
   - Invoice generation
   - Payment processing (Stripe)
   - Reconciliation

3. Access controls
   - API key management
   - Admin access to financial systems
   - Segregation of duties

4. Change management
   - Code deployments affecting financial systems
   - Production changes approved

5. Data integrity
   - Financial data (usage, billing, payments) accurate
   - Database access controls
   - Audit trail for changes

Create inventory:
- Control ID
- Control objective
- Control activity
- Frequency (daily, monthly, quarterly)
- Owner
- Status (designed, implemented, tested, effective)

Document in: ./docs/sox/controls-inventory.md

`,
});

phase('Control Documentation');
const docs = await parallel([
  () => agent('Write Control Narratives', {
    label: 'control-narratives',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Control narratives:

1. For each control, document:
   - Control ID (e.g., FIN-001)
   - Control name
   - Control objective (what risk it mitigates)
   - Control type: preventive vs detective
   - Control frequency: real-time, daily, monthly, quarterly
   - Control owner (role, not person)
   - Control description (step-by-step)
   - Systems involved
   - Inputs and outputs
   - Exceptions and compensating controls

2. Example: Revenue Recognition Control (FIN-001)
   Objective: Ensure revenue recognized in correct period
   Type: Preventive
   Frequency: Monthly (at period close)
   Owner: Head of Finance
   Description:
     1. Billing service generates usage records for each tenant
     2. Usage records include: tenant_id, period_start, period_end, usage_qty, unit_price
     3. Revenue calculation: usage_qty * unit_price
     4. Journal entries created for each tenant
     5. Revenue manager reviews journal entries for accuracy
     6. Any adjustments require CFO approval
   Systems: billing-service, database (journal_entries table)
   Exceptions: Manual adjustments >$10k require additional approval

3. Risk and Control Matrix (RCM):
   | Risk | Control ID | Control | Frequency | Owner | Test Procedure |
   |------|------------|---------|-----------|-------|----------------|
   | Revenue misstated | FIN-001 | Usage-based billing calculated correctly | Monthly | Finance Manager | Select sample, recalc revenue |

4. Store in: ./docs/sox/control-narratives/

`,
  }),
  () => agent('Write Test Procedures', {
    label: 'test-procedures',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Test procedures for SOX controls:

1. For each control, define:
   - Test objective
   - Sample size (e.g., 25 items for sample testing)
   - Selection method (random, systematic)
   - Test steps
   - Expected result
   - Pass/fail criteria
   - Evidence required

2. Example: FIN-001 Test
   Objective: Verify revenue recognition accurate
   Sample: 25 tenants from month
   Steps:
     1. Obtain usage report for sample tenants
     2. Obtain billing invoice
     3. Recalculate: usage_qty * unit_price = invoice_amount
     4. Compare to recorded revenue in journal
     5. Verify approval signatures on adjustments
   Expected: All calculations match, approvals present
   Evidence: Usage report, invoices, journal entries

3. Automated controls:
   - System-generated reports
   - Test: review system configuration, run test transaction, verify output

4. Manual controls:
   - Reviewer sign-off
   - Test: inspect signed forms, workflow approvals

5. ITGC (IT General Controls):
   - Change management: verify code changes approved
   - Access: verify admin users reviewed quarterly
   - Operations: verify backup jobs executed

6. Store in: ./docs/sox/test-procedures/

`,
  }),
]);

phase('Control Testing');
const testing = await parallel([
  () => agent('Test Design Effectiveness', {
    label: 'design-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test design effectiveness (Phase I):

1. Objective: Verify each control is properly designed to mitigate risk.

2. For each control:
   - Walk through control with owner
   - Review control documentation
   - Ask: "If issue occurs, would this control catch it?"
   - Document design gap if any

3. Common design issues:
   - Control covers only partial risk
   - Owner lacks authority to execute control
   - System misconfiguration prevents control from working
   - Frequency insufficient

4. Document findings:
   - Control FIN-001: DESIGN EFFECTIVE
   - Control FIN-002: DESIGN DEFICIENT - missing approval step for credits

5. Remediation:
   - For deficient controls: design remediation plan
   - Implement fix (add approval workflow, change frequency)
   - Re-test design after fix

6. Report:
   - % controls with effective design
   - List deficient controls
   - Management response: accept risk or remediate

`,
  }),
  () => agent('Test Operating Effectiveness', {
    label: 'operating-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test operating effectiveness (Phase II):

1. Objective: Verify control operates as designed over time.

2. Sample testing:
   - Select sample size (typically 25 for monthly controls)
   - Period: last 3-6 months
   - Test each item in sample

3. For automated controls:
   - Test ITGC (change management, access)
   - Verify system configuration matches design
   - Run test transaction, verify control fires

4. For manual controls:
   - Inspect evidence (approval emails, signed forms)
   - Verify reviewer performed control
   - Check timing (within required frequency)

5. Deficiencies:
   - Deficiency: control performed but with exception
   - Significant deficiency: multiple deficiencies
   - Material weakness: likely to cause material misstatement

6. Example:
   Control: Monthly revenue review
   Sample: Jan, Feb, Mar, Apr, May reviews
   Findings:
   - Jan: complete, signed ✓
   - Feb: incomplete, missing CFO signature ✗
   - Mar: complete ✓
   - Apr: missing entirely ✗
   - May: complete ✓
   Result: 3/5 (60%) effective → OPERATING DEFICIENCY

7. Document with evidence screenshots.

`,
  }),
  () => agent('Test IT General Controls', {
    label: 'itgc-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `ITGC testing:

1. Change Management:
   - Verify all production changes go through PR approval
   - Sample: 25 changes from last 6 months
   - Check: code review, testing evidence, deployment approval
   - Emergency changes: post-facto review

2. Access Controls:
   - Review admin users for financial systems
   - Verify quarterly access review performed
   - Check for terminated employees still have access
   - Verify least privilege (no excessive access)

3. Operations:
   - Backup jobs: verify daily backups executed, tested restore
   - Monitoring: alerts configured, reviewed
   - Incident management: security incidents tracked

4. Logical Security:
   - API key rotation: verify rotated annually
   - Password policies: complexity, expiration
   - Encryption: data at rest encrypted, TLS in transit

5. Evidence:
   - Screenshots from GitHub PR approvals
   - Access review sign-offs
   - Backup logs
   - Vulnerability scans

6. Report ITGC deficiencies separately.

`,
  }),
]);

phase('Remediation Plan');
const remediation = await parallel([
  () => agent('Create Remediation Plan', {
    label: 'remediation-plan',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Remediation plan for SOX deficiencies:

1. Catalog deficiencies:
   - Control FIN-002: Missing approval for credits
   - Control FIN-005: Quarterly access review not performed
   - Change Management: 3 emergency changes without review

2. For each deficiency:
   - Root cause analysis
   - Remediation steps
   - Owner
   - Due date
   - Test of remediation

3. Example remediation:
   Deficiency: Credits >$10k not approved
   Root cause: No workflow for credit approvals
   Remediation:
     1. Implement credit approval workflow in billing system (by Aug 30)
     2. Train finance team on new workflow (by Sep 5)
     3. Test 5 credit transactions post-implementation (by Sep 15)
   Owner: Finance Manager
   Due: Sep 15, 2025

4. Compensing controls:
   - Temporary: CFO manually reviews all credits weekly until fixed
   - Document as compensating control

5. Tracking:
   - Weekly status updates
   - Escalate overdue items

6. Report to audit committee.

`,
  }),
  () => agent('Implement Control Fixes', {
    label: 'control-fixes',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement SOX control fixes:

1. Credit approval workflow:
   - Billing system: credits >$10k require CFO approval
   - Implement approval state machine
   - Notify CFO via email/Slack
   - Record approval in audit log

2. Access review automation:
   - Quarterly cron job: list all financial system users
   - Email to system owners: "Review these users, confirm access"
   - Collect responses, disable unused accounts
   - Evidence: email logs, access changes

3. Change management enforcement:
   - Block production deploy without PR approval
   - Emergency changes require post-hoc ticket
   - Track in deployment logs

4. Audit trail enhancements:
   - Log all financial data changes (billing, revenue)
   - Include: who, what, when, before/after
   - Retain 7 years (SOX requirement)

5. Automated controls:
   - Daily reconciliation: Stripe payouts vs recorded revenue
   - Alert if mismatch >$1000
   - Evidence: reconciliation report

6. After fixes, re-test controls.

`,
  }),
]);

phase('Auditor Evidence Package');
const evidence = await parallel([
  () => agent('Compile Evidence for External Auditor', {
    label: 'auditor-evidence',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Compile auditor evidence package:

1. Control narratives (all financial controls)
2. Risk and Control Matrix (RCM)
3. Test procedures
4. Testing results:
   - Design effectiveness: ✓/✗ per control
   - Operating effectiveness: ✓/✗ with sample evidence
   - ITGC testing results
5. Remediation plan and status
6. Control environment documentation:
   - Organization chart
   - Policies (security, change management, access)
7. System documentation:
   - Architecture diagrams
   - Data flow for financial data
   - Billing system design
8. Evidence samples:
   - Screenshots of approvals
   - Export of access review logs
   - Change management reports
   - Reconciliation reports
9. List of open deficiencies
10. Management representation letter

Organize in: ./docs/sox/auditor-evidence-2025/

Provide to auditor with cover letter.

`,
  }),
  () => agent('Prepare Management Assessment', {
    label: 'management-assessment',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Management assessment of internal controls:

1. CEO/CFO attestation required:
   "Management is responsible for establishing and maintaining effective internal control over financial reporting."

2. Assessment conclusion:
   - Effective (no material weaknesses)
   - Effective with deficiencies (significant deficiencies)
   - Not effective (material weakness)

3. Report content:
   - Scope: financial reporting controls for algo-trader platform
   - Period: Jan 1 - Dec 31, 2025
   - Control framework: COSO 2013
   - Control environment summary
   - Deficiencies identified
   - Remediation status
   - Conclusion: internal control effective (or not)

4. Document:
   ./docs/sox/management-assessment-2025.md

5. Signatures:
   - CEO: Long Tho
   - CFO: [Name]
   - Date: Dec 31, 2025

6. Include:
   - Materiality threshold: $100k
   - Whether any fraud identified
   - Changes in controls during period

`,
  }),
]);

phase('Sign-off');
const signoff = await parallel([
  () => agent('SOX Controls Sign-off', {
    label: 'sox-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off SOX Controls.

Tasks #63, #64

Review:
✅ SOX control inventory complete (30 controls)
✅ Control narratives documented with RCM
✅ Test procedures defined
✅ Design effectiveness testing completed
✅ Operating effectiveness testing completed
✅ ITGC testing completed
✅ Deficiencies identified and remediated
✅ Auditor evidence package compiled
✅ Management assessment prepared
✅ Ready for external auditor (PwC/Deloitte)

Decision: SOX 404 COMPLIANCE READY FOR YEAR-END.
Internal control over financial reporting effective.

`,
  }),
]);

log('SOX Controls Completion workflow launched');