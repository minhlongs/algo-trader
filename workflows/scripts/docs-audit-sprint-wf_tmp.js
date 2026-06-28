export const meta = {
  name: 'documentation-audit-sprint',
  description: 'Complete documentation audit: update all docs to match current codebase',
  phases: [
    { title: 'Planning', detail: 'Audit docs, identify gaps, create update plan' },
    { title: 'Core Docs', detail: 'Update PDR, Code Standards, Architecture, Summary' },
    { title: 'API Docs', detail: 'Ensure API docs match OpenAPI spec' },
    { title: 'Ops Docs', detail: 'Update runbooks, troubleshooting, SLOs' },
    { title: 'Dev Docs', detail: 'Update onboarding, SDK docs, contributing' },
    { title: 'Final Audit', detail: 'Completeness check, quality review' },
  ],
};

phase('Planning');
const planning = await agent('Docs Audit Plan', {
  label: 'docs-plan',
  agentType: 'docs-manager',
  isolation: 'worktree',
  prompt: `Plan documentation audit for tasks #198, #218, #225, #235.

Audit all docs in docs/: core, API, operational, developer. Create plan in ./plans/docs-audit-sprint/plan.md with inventory, priority, timeline.

Work context: /Users/macbook/algo-trader
Reports: /Users/macbook/algo-trader/plans/reports/
`,
});

phase('Core Docs');
const coreDocs = await parallel([
  () => agent('Update Core Docs', {
    label: 'core-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Update core docs: PDR, code-standards, system-architecture, codebase-summary. Ensure accuracy, update diagrams, current metrics.

Files: docs/product-development-requirements.md, docs/code-standards.md, docs/system-architecture.md, docs/codebase-summary.md
`,
  }),
  () => agent('Validate Doc Links', {
    label: 'docs-link-check',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Check all doc links: internal links resolve, external URLs valid, no broken images.
`,
  }),
]);

phase('API Docs');
const apiDocs = await parallel([
  () => agent('Update API Docs', {
    label: 'api-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Update API documentation: ensure OpenAPI spec complete, generate reference, update SDK READMEs with examples.

Files: openapi.yaml, docs/api/*.md, SDK READMEs
`,
  }),
  () => agent('Verify API Docs Accuracy', {
    label: 'api-docs-check',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test 20 random endpoints against staging API. Verify request/response match spec, errors documented.
`,
  }),
]);

phase('Ops Docs');
const opsDocs = await parallel([
  () => agent('Update Runbooks', {
    label: 'runbooks',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Update operational runbooks: alert-response, incident-management, chaos-engineering, replication-troubleshooting, security-incidents.

Files: docs/operational-runbooks/*.md
`,
  }),
  () => agent('Update SLOs & Monitoring', {
    label: 'slo-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Update SLO documentation and monitoring overview with current metrics.

Files: docs/slos.md, docs/monitoring-overview.md
`,
  }),
]);

phase('Dev Docs');
const devDocs = await parallel([
  () => agent('Update Onboarding Guide', {
    label: 'onboarding-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Update engineering onboarding: getting-started, architecture-deep-dive, development-workflow, troubleshooting.

Files: docs/onboarding/*.md
`,
  }),
  () => agent('Update SDK & Contributing Docs', {
    label: 'sdk-contributing-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Update SDK documentation and CONTRIBUTING.md with current workflows.

Files: SDK READMEs, CONTRIBUTING.md
`,
  }),
]);

phase('Final Audit & Sign-off');
const final = await parallel([
  () => agent('Run Completeness Check', {
    label: 'docs-completeness',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Documentation completeness audit: check structure, links, code snippets, diagrams, dates. Report score and gaps.
`,
  }),
  () => agent('Documentation Sign-off', {
    label: 'docs-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off for documentation audit. Review all updates. Decision: LOCKED FOR RELEASE or NEEDS REVISION.

Return: Sign-off report.
`,
  }),
]);

log('Documentation Audit workflow launched');