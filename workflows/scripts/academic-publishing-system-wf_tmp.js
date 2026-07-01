export const meta = {
  name: 'academic-publishing-system',
  description: 'Implement academic publishing system: paper management, peer review, conference submissions, citation tracking',
  phases: [
    { title: 'Academic Publishing Planning', detail: 'Design paper submission, review workflow, publication tracking' },
    { title: 'Paper Management API', detail: 'Submit, edit, track papers, versions' },
    { title: 'Peer Review Workflow', detail: 'Reviewer assignment, review process, decisions' },
    { title: 'Conference Submission System', detail: 'Call for papers, submission deadlines, notifications' },
    { title: 'Citation Tracking', detail: 'Track citations, metrics, h-index' },
    { title: 'Publication Dashboard', detail: 'Publications, impact metrics, author stats' },
    { title: 'Testing & Sign-off', detail: 'Validate workflow, academic standards' },
  ],
};

phase('Planning');
const planning = await agent('Academic Publishing Plan', {
  label: 'publishing-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan academic publishing system. Task #112.

For research papers on algo-trader, quantitative finance:

1. Paper submission:
   - Authors submit papers (PDF + metadata)
   - Abstract, keywords, authors, affiliations
   - Track submission status

2. Peer review:
   - Editor assigns reviewers (2-3 per paper)
   - Reviewers submit reviews (accept/reject/revise)
   - Blind or double-blind review
   - Revision cycles

3. Conference/journal publication:
   - Track acceptance/rejection
   - Publish papers (DOI assignment)
   - Index in databases (arXiv, SSRN)

4. Citation tracking:
   - Pull citations from Google Scholar, Semantic Scholar
   - Track citation count over time
   - Compute h-index for authors

5. Metrics:
   - Paper downloads/views
   - Citation count
   - Author impact

Create plan: ./plans/academic-publishing/plan.md
`,
});

phase('Paper Management API');
const paper = await parallel([
  () => agent('Implement Paper Submission API', {
    label: 'paper-submission',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Paper submission API:

1. Submit paper:
   POST /api/v1/papers/submit
   Multipart:
   - metadata (JSON): { title, abstract, keywords[], authors[] }
   - file: PDF

   Authors array:
   { name, email, affiliation, orcid?, is_corresponding }

2. Draft management:
   - Save as draft before submission
   - Update metadata/files
   - Submit to editorial office

3. Paper status:
   submitted → under_review → revision_requested → resubmitted → accepted/rejected → published

4. Paper record:
   papers table:
   id UUID PK
   title, abstract, keywords jsonb
   pdf_url (S3)
   status enum
   submitted_at, published_at
   doi? varchar

5. Paper versions:
   - Each revision creates new version
   - Track changes

`,
  }),
  () => agent('Create Author Dashboard', {
    label: 'author-dashboard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Author dashboard:

Page: /research/papers/my

For each author (ORCID-linked):

1. My submissions:
   - Table: title, submitted_date, status, journal/conference
   - Status color coding
   - Actions: edit draft, view reviews, upload revision

2. Publications:
   - Published papers with citation counts
   - Link to PDF, DOI
   - Altmetrics (mentions, news)

3. Metrics:
   - Total submissions
   - Acceptance rate
   - Total citations
   - h-index (based on algo-trader publications)

4. Co-authors:
   - List of collaborators
   - Joint papers count

5. Notifications:
   - Review requested
   - Decision ready
   - Paper published
   - Citation alerts

`,
  }),
]);

phase('Peer Review Workflow');
const review = await parallel([
  () => agent('Implement Review Assignment', {
    label: 'review-assign',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Review assignment:

1. Editor panel:
   /admin/review/queue
   - Papers awaiting review assignment
   - Suggest reviewers based on:
     * Keyword match with paper
     * Past review history
     * Expertise from author profile

2. Assign reviewers:
   POST /api/v1/reviews/assign
   { paper_id, reviewers: [{ email, name? }] }

3. Invite reviewers:
   - Email with paper abstract, review deadline (4 weeks)
   - Accept/decline link
   - Reminder emails (1 week before deadline)

4. Review count tracking:
   - Each reviewer assigned count
   - Max concurrent reviews (e.g., 3)
   - Reviewer workload balanced

5. Reviewer database:
   reviewers table:
   id, email, name, affiliation, expertise[], active_reviews_count
   review_history: paper_id, decision, timestamps

`,
  }),
  () => agent('Implement Review Submission', {
    label: 'review-submit',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Review submission:

1. Reviewer access:
   - Unique link from email
   - No login required (one-time token)

2. Review form:
   - Overall recommendation: accept/accept with revisions/reject
   - Confidence: high/medium/low
   - Main strengths (text)
   - Main weaknesses (text)
   - Detailed comments (per section)
   - Annotations on PDF (optional)

3. Submit review:
   POST /api/v1/reviews/:id/submit
   { recommendation, confidence, comments, section_comments[] }

4. Anonymous review:
   - Author sees only anonymized review
   - Reviewer identity hidden until publication
   - Option for open review (with consent)

5. Editor dashboard:
   /admin/reviews/paper/:id
   - All reviews for paper
   - Compare recommendations
   - Make decision based on reviews

`,
  }),
  () => agent('Implement Editorial Decision', {
    label: 'editorial-decision',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Editorial decision:

1. Decision options:
   - Accept (no further review needed)
   - Minor revision (author revises, editor checks)
   - Major revision (resubmit + re-review)
   - Reject

2. Decision process:
   Editor reviews all reviews
   POST /api/v1/papers/:id/decision
   {
     "decision": "major_revision",
     "decision_letter": "text explaining decision",
     "revision_deadline": "2025-09-01"
   }

3. Notify authors:
   Email with decision letter
   - Include anonymized reviews
   - Instructions for revision

4. Revision workflow:
   - Author uploads revised paper
   - Respond to reviews (point-by-point)
   - Editor reviews changes
   - May send back to reviewers

5. Final acceptance:
   - Paper status → accepted
   - Prepare for publication (copyediting, typesetting)
   - Assign DOI

`,
  }),
]);

phase('Conference Submission System');
const conference = await parallel([
  () => agent('Implement Call for Papers', {
    label: 'cfp',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Call for Papers (CFP):

1. Conference/journals:
   Conferences:
   - Quantitative Finance Summit (QFS)
   - AI in Trading Conference (AITC)
   Journals:
   - Journal of Algorithmic Trading (JAT)
   - Quantitative Finance Review (QFR)

2. CFP creation (admin):
   POST /api/v1/conferences
   {
     name, description,
     submission_deadline,
     notification_date,
     conference_date,
     tracks: [{ track_name, description }],
     topics: ["machine learning", "risk management", ...]
   }

3. Public CFP page:
   /research/cfp
   List active calls with deadlines
   "Submit paper" button

4. Submission:
   Author submits to specific conference/track
   Paper linked to CFP

5. Email notifications:
   - CFP announcement to mailing list
   - Reminder 2 weeks before deadline
   - Confirmation of submission

`,
  }),
  () => agent('Implement Conference Management', {
    label: 'conf-mgmt',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Conference management:

1. Program committee:
   - Chair, co-chairs
   - Track chairs
   - Assign papers to track chairs

2. Review assignment:
   - Track chair reviews assigned papers
   - May delegate to additional reviewers
   - Ensure 2-3 reviews per paper

3. Acceptance decisions:
   - Track chairs recommend accept/reject
   - Program chair reviews conflicts
   - Final program assembled

4. Notifications:
   - Acceptance/rejection emails
   - Include feedback from reviews
   - Registration instructions for accepted

5. Proceedings:
   - Accepted papers collected
   - Generate PDF proceedings
   - Assign ISBN/DOI
   - Upload to conference website

6. Presentation scheduling:
   - Assign talks/posters to slots
   - Publish program agenda

`,
  }),
]);

phase('Citation Tracking');
const citation = await parallel([
  () => agent('Implement Citation Import', {
    label: 'citation-import',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Citation import:

1. Sources:
   - Google Scholar (web scrape or API if available)
   - Semantic Scholar API
   - arXiv API
   - Crossref
   - Manual entry

2. Import process:
   For each published paper (with DOI):
   - Query source APIs for citations
   - Extract: citing_paper_title, authors, year, DOI
   - Deduplicate citations
   - Store in citations table

3. Scheduled import:
   - Daily cron: import new citations for all papers
   - Backfill: import for all papers on initial setup

4. Citation count update:
   papers.citation_count = count(citations WHERE cited_paper_id = paper.id)

5. Citation network:
   citations table:
   citing_paper_id, cited_paper_id, source, imported_at

6. Manual correction:
   - Admin can add/remove citations
   - Merge duplicate citation records

`,
  }),
  () => agent('Calculate Author Metrics', {
    label: 'author-metrics',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Author metrics:

1. Citation metrics per author:
   - Total citations (all papers)
   - h-index: max h where h papers have ≥h citations each
   - i10-index: papers with ≥10 citations
   - Average citations per paper

2. Calculation:
   For author_id:
   - Get all papers by author
   - Get citation counts for each paper
   - Sort descending
   - h-index: largest i where papers[i] >= i+1

3. Institutional metrics:
   - Affiliation-level aggregation
   - Top affiliated institutions

4. Trend analysis:
   - Citations over time (per paper, per author)
   - Year-over-year growth

5. API:
   GET /api/v1/authors/:id/metrics
   {
     "total_citations": 1250,
     "h_index": 12,
     "i10_index": 8,
     "avg_citations_per_paper": 25,
     "papers": [{ "id", "title", "citations" }]
   }

`,
  }),
]);

phase('Publication Dashboard');
const dashboard = await parallel([
  () => agent('Create Publications Dashboard', {
    label: 'pubs-dashboard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Publications dashboard:

Page: /research/publications

1. Publications list:
   - Filter by author, year, journal/conference
   - Sort by citations, date
   - Columns: title, authors, venue, year, citations, DOI

2. Metrics summary:
   - Total publications: X
   - Total citations: Y
   - h-index: Z
   - Publications by venue (journal vs conference)

3. Top papers:
   - Most cited (all time, last 5 years)
   - Recent publications

4. Citation timeline:
   - Citations over time (for selected paper or all)
   - Yearly breakdown

5. Author profiles:
   Click author → profile page:
   - Bio, affiliation, ORCID
   - Publications list
   - Metrics (h-index, total citations)
   - Co-author network graph

6. Venue metrics:
   - Top venues where algo-trader published
   - Acceptance rates

`,
  }),
  () => agent('Implement Altmetric Tracking', {
    label: 'altmetrics',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Altmetric tracking:

1. Track mentions:
   - News articles
   - Blog posts
   - Twitter/X mentions
   - GitHub stars (if code published)
   - Stack Overflow questions

2. Sources:
   - Altmetric API (if available)
   - Manual aggregation from:
     * Twitter API (search by paper title/DOI)
     * News APIs
     * GitHub search

3. Score calculation:
   - News: 3 points (major), 1 point (minor)
   - Twitter: 1 point per tweet
   - Blog: 2 points
   - GitHub: stars count
   - Total: Altmetric donut score

4. Display:
   - Paper page: altmetric badge
   - Dashboard: papers with highest altmetric

5. Engagement:
   - "Share on Twitter" button
   - "Download citation" (BibTeX)

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Test Publishing Workflow', {
    label: 'publish-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test complete publishing workflow:

1. Submission flow:
   - Author submits paper → receives confirmation
   - Editor sees in queue
   - Assign reviewers

2. Review flow:
   - Reviewers invited, accept/decline
   - Reviews submitted
   - Editor makes decision
   - Author notified

3. Revision flow:
   - Author uploads revision
   - Responds to reviews
   - Editor re-checks

4. Publication:
   - Paper accepted → status published
   - DOI assigned
   - Appears in publications list

5. Citation import:
   - Semantic Scholar API returns citations
   - Counts update
   - Author metrics recalculated

6. Edge cases:
   - Duplicate submission prevention
   - Concurrent review assignment
   - Deadline handling

`,
  }),
  () => agent('Academic Publishing Sign-off', {
    label: 'publishing-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Academic Publishing System.

Review:
✅ Paper submission and management
✅ Peer review workflow (assignment, submission, decision)
✅ Conference/journal management
✅ Call for papers
✅ Citation tracking from multiple sources
✅ Author metrics (h-index, citations)
✅ Publications dashboard
✅ Altmetric tracking
✅ Testing complete

Decision: ACADEMIC PUBLISHING SYSTEM PRODUCTION READY.

`,
  }),
]);

log('Academic Publishing System workflow launched');