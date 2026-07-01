export const meta = {
  name: 'academic-publishing-system',
  description: 'Implement academic publishing system: paper submission, peer review, editorial workflow, publication',
  phases: [
    { title: 'Publishing Planning', detail: 'Design academic paper submission and publication workflow' },
    { title: 'Paper Submission', detail: 'Author submission portal, manuscript upload, metadata' },
    { title: 'Editorial Workflow', detail: 'Editor assignment, reviews, decisions' },
    { title: 'Peer Review', detail: 'Reviewer invitations, review forms, responses' },
    { title: 'Production', detail: 'Typesetting, final proofs, DOI assignment' },
    { title: 'Publication', detail: 'Public archive, indexing, notifications' },
    { title: 'Testing & Sign-off', detail: 'End-to-end test, quality assurance' },
  ],
};

phase('Planning');
const planning = await agent('Academic Publishing Plan', {
  label: 'publishing-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan academic publishing system. Task #112.

Scope:
- Paper submission (LaTeX, Word, PDF)
- Editorial workflow (submit → review → revise → accept/reject → publish)
- Peer review (double-blind, reviewer matching)
- Production (typesetting, XML, DOI)
- Publication (open access, arXiv mirror)
- Indexing (Google Scholar, Semantic Scholar)

Target: Research papers on trading strategies, ML models, quantum algorithms.

Create plan: ./plans/academic-publishing/plan.md
`,
});

phase('Paper Submission');
const submission = await parallel([
  () => agent('Implement Submission Portal', {
    label: 'submission-portal',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement paper submission portal.

API endpoints:
- POST /api/v1/papers/submit
  Fields: title, abstract, authors[], keywords[], categories, manuscript (file), supplementary (file)
- GET /api/v1/papers?status=submitted
- GET /api/v1/papers/:id
- PUT /api/v1/papers/:id (withdraw, replace)

Database:
papers: id, title, abstract, authors, keywords, status, submitted_at, updated_at
paper_files: id, paper_id, type (manuscript/supplementary), storage_url, filename

Storage: Cloudflare R2 with signed URLs for upload/download.

`,
  }),
  () => agent('Implement Manuscript Processing', {
    label: 'manuscript-processing',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Manuscript processing:

1. File validation:
   - Allowed: PDF, DOCX, LaTeX (ZIP)
   - Max size: 50MB
   - Virus scan (ClamAV)
2. Metadata extraction:
   - PDF: title, authors from embedded metadata
   - LaTeX: parse .tex for title/author
3. Plagiarism check: iThenticate API or local similarity detection
4. Convert to plain text for review (pdftotext, pandoc)

Service: src/services/manuscript-processor.service.ts

`,
  }),
]);

phase('Editorial Workflow');
const editorial = await parallel([
  () => agent('Implement Editorial Assignment', {
    label: 'editorial-assign',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Editorial workflow:

Editor-in-Chief assigns:
- Handling Editor to paper
- Action Editor for each review round

Assignment API:
- POST /api/v1/editorial/assign?paper_id=X&editor_id=Y
- Editor sees assigned papers: GET /api/v1/editor/papers

Database:
editorial_assignments: id, paper_id, editor_id, assigned_at, decision_deadline

Notifications: email to editor when paper assigned.

`,
  }),
  () => agent('Implement Decision Workflow', {
    label: 'decision-workflow',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Decision workflow:

Decisions: Accept, Revise (minor/major), Reject

Flow:
1. Editor reviews reviews
2. Makes decision with comments
3. Notify authors
4. If revise: authors upload revised manuscript
5. Repeat review if needed

API:
- POST /api/v1/editorial/decisions (paper_id, decision, comments)
- Author sees decision: GET /api/v1/author/papers/:id/decisions

`,
  }),
]);

phase('Peer Review');
const review = await parallel([
  () => agent('Implement Reviewer Matching', {
    label: 'reviewer-matching',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Reviewer matching system.

Match reviewers based on:
1. Expertise: keywords, categories (cosine similarity to paper abstract)
2. Publication record: papers in same field
3. Conflict detection: co-authors, same institution
4. Availability: reviewer workload (max 3 active reviews)

Auto-suggest reviewers to editors.

`,
  }),
  () => agent('Implement Review Submission', {
    label: 'review-submission',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Review submission:

Reviewer receives invitation, accepts/declines.

Review form:
- Overall rating: 1-5
- Originality: 1-5
- Methodology: 1-5
- Clarity: 1-5
- Detailed comments (textarea)
- Recommendation: Accept/Revise/Reject
- Confidential notes to editor

API:
- POST /api/v1/reviews (paper_id, ratings, comments)
- GET /api/v1/reviewer/papers (invitations)
- PUT /api/v1/reviews/:id (submit)

`,
  }),
  () => agent('Implement Double-Blind Review', {
    label: 'double-blind',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Double-blind review:

1. Submission: author names hidden from reviewer
2. Manuscript: remove self-citations (detect "in our previous work")
3. Reviewer anonymity: author doesn't see reviewer name
4. Reveal identities after decision: author suggestions for next round

Implementation:
- Store blinded manuscript version (or mask in viewer)
- Review assignment table hides identities
- After final decision: reveal author names and reviewer names to both sides.

`,
  }),
]);

phase('Production');
const production = await parallel([
  () => agent('Implement Typesetting', {
    label: 'typesetting',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Automatic typesetting:

Input: accepted manuscript (LaTeX or Word)
Output: PDF (camera-ready), XML (JATS), HTML (web)

Process:
1. LaTeX → latexmk → PDF
2. LaTeX → pandoc → JATS XML
3. Apply journal template (class file, style)
4. Quality check: page count, figure resolution, references

If Word: convert to LaTeX first (pandoc) or use Word template.

Service: src/services/typesetting.service.ts

`,
  }),
  () => agent('Implement DOI Assignment', {
    label: 'doi-assign',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `DOI assignment via DataCite or Crossref.

DOI prefix: 10.54320/algo-trader.<year>.<sequential>

On paper acceptance:
1. Reserve DOI with DataCite API
2. Store DOI in papers table
3. Mint DOI: POST to DataCite with metadata (title, authors, abstract, published date)
4. URL: https://doi.org/10.xxxx

Metadata:
- Title, authors (ORCID if available)
- Abstract
- Keywords
- Publication date
- License (CC BY 4.0)
- Resource type: "journal article"

`,
  }),
]);

phase('Publication');
const publish = await parallel([
  () => agent('Implement Publication API', {
    label: 'publish-api',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Publication endpoints:

- GET /api/v1/papers/:id (public, no auth)
  Returns: title, authors, abstract, pdf_url, doi, published_at
- GET /api/v1/papers?published=true (list)
- GET /api/v1/papers?author=<name>
- GET /api/v1/papers?keyword=<kw>

Static site generation:
- Generate HTML pages from published papers
- Upload to R2 public bucket
- Serve via Cloudflare Workers (CDN)

`,
  }),
  () => agent('Implement Indexing', {
    label: 'indexing',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Indexing for search engines:

1. Sitemap: /sitemap.xml with all paper URLs
2. Schema.org markup: add JSON-LD to paper pages
3. Google Scholar: submit source, verify inclusion
4. Semantic Scholar: API integration
5. arXiv: auto-submit (if desired)

Sitemap generation: cron job generates sitemap from published papers.

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('E2E Publishing Tests', {
    label: 'publish-e2e',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `E2E test full publishing workflow:

1. Author submits paper (PDF, metadata)
2. Editor assigns handling editor
3. Editor invites 2 reviewers
4. Reviewers submit reviews
5. Editor makes decision: "Revise"
6. Author uploads revised manuscript
7. Second review round
8. Editor accepts paper
9. Typesetting generates PDF/XML
10. DOI minted
11. Paper published and appears on public site
12. Sitemap updated

`,
  }),
  () => agent('Academic Publishing Sign-off', {
    label: 'publish-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off academic publishing system.

Review:
✅ Submission portal
✅ Manuscript processing (validation, plagiarism)
✅ Editorial workflow
✅ Double-blind peer review
✅ Typesetting
✅ DOI assignment
✅ Publication and indexing
✅ E2E tests passing

Decision: ACADEMIC PUBLISHING PRODUCTION READY.

`,
  }),
]);

log('Academic Publishing workflow launched');