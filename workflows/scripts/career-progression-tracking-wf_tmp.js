export const meta = {
  name: 'career-progression-tracking',
  description: 'Implement career progression tracking system: skill matrices, level assessments, promotion workflows, IDP integration',
  phases: [
    { title: 'Career Tracking Planning', detail: 'Design career ladder, tracking system, workflows' },
    { title: 'Career Levels API', detail: 'Define levels, skills, assessment criteria' },
    { title: 'Employee Skill Profiles', detail: 'Track employee skills, competencies, assessments' },
    { title: 'Promotion Workflow', detail: 'Nomination, review, approval, calibration' },
    { title: 'Individual Development Plan (IDP)', detail: 'Goal setting, progress tracking, mentorship' },
    { title: 'Analytics & Reporting', detail: 'Career progression metrics, diversity analysis' },
    { title: 'Testing & Sign-off', detail: 'Validate system, HR sign-off' },
  ],
};

phase('Planning');
const planning = await agent('Career Tracking Plan', {
  label: 'career-tracking-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan career progression tracking. Task #209.

System components:
1. Career ladder: IC (IC1-IC5) and Manager (M1-M5) tracks
2. Skill matrix: technical, leadership, communication, impact
3. Level assessments: self, manager, peer, calibration
4. Promotion workflow: nomination → review → calibration → approval
5. IDP: goals, learning plan, mentorship matching
6. Analytics: promotion rates, time-to-level, diversity metrics

Integrate with:
- Performance review system (Task 206)
- Mentorship program (Task 205)
- Training resource catalog (Task 208)

Create plan: ./plans/career-progression/plan.md
`,
});

phase('Career Levels API');
const levels = await parallel([
  () => agent('Define Career Level Schema', {
    label: 'level-schema',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Career level definitions:

Database schema:

1. career_tracks:
   id UUID PK
   name: "Engineering IC" | "Engineering Manager" | "Sales" | ...
   description

2. career_levels:
   id UUID PK
   track_id UUID FK
   level_number: 1-5 (or 1-7 for some tracks)
   title: "Senior IC", "Staff IC", "Principal IC", "VP"
   description
   expected_experience_years
   base_salary_range_min, max
   equity_range_min, max

3. level_skills:
   id UUID PK
   level_id UUID FK
   skill_category: "technical"|"leadership"|"communication"|"impact"
   skill_name: "System Design", "Code Review", "Mentoring", ...
   required_level: 1-5 (proficiency scale)
   is_critical: boolean (must-have for promotion)

4. employees:
   Add: current_level_id FK, career_track_id FK

`,
  }),
  () => agent('Create Career Levels API', {
    label: 'levels-api',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Career Levels API:

1. List levels:
   GET /api/v1/career/tracks/:track_id/levels
   Returns: [{ level_number, title, description, skills[] }]

2. Get level requirements:
   GET /api/v1/career/levels/:level_id/skills
   Returns: required skills with proficiency levels

3. Assign employee to track/level:
   POST /api/v1/employees/:id/career
   Body: { track_id, level_id, effective_date }

4. Update level (promotion):
   POST /api/v1/employees/:id/promotion
   Body: { new_level_id, promotion_date, rationale }

Admin only: manage tracks, levels, skills.

`,
  }),
]);

phase('Employee Skill Profiles');
const profiles = await parallel([
  () => agent('Implement Skill Assessment System', {
    label: 'skill-assessments',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Skill assessment:

1. Assessment types:
   - Self assessment
   - Manager assessment
   - Peer assessments (360)
   - Calibration session (leadership consensus)

2. Proficiency scale: 1-5
   - 1: New to skill
   - 2: Basic understanding
   - 3: Can work independently
   - 4: Can teach others
   - 5: Expert/thought leader

3. Assessment workflow:
   - Employee selects skills from target level
   - Self-rate (1-5)
   - Manager reviews and adjusts
   - Peers provide feedback (optional)
   - Calibration: compare across team

4. Database:
   skill_assessments:
   - employee_id, assessor_id, skill_id, proficiency, assessment_date, source (self/manager/peer)

5. API:
   POST /api/v1/employees/:id/assessments
   GET /api/v1/employees/:id/skills  // current profile

`,
  }),
  () => agent('Create Skill Gap Analysis', {
    label: 'skill-gap',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Skill gap analysis:

For employee at current level, targeting next level:

1. Get target level required skills
2. Compare with employee's current assessment
3. Identify gaps:
   - Missing skills (not assessed)
   - Skills below required proficiency

4. Response:
{
  "employee": { "id", "name", "current_level": "IC3" },
  "target_level": "IC4",
  "gaps": [
    {
      "skill": "System Design",
      "required": 4,
      "current": 3,
      "gap": "one level below"
    },
    {
      "skill": "Technical Leadership",
      "required": 3,
      "current": null,
      "gap": "not assessed yet"
    }
  ],
  "recommendations": [
    "Complete System Design training course",
    "Lead design review for next project",
    "Mentor junior engineer on architecture"
  ]
}

Endpoint: GET /api/v1/employees/:id/career-gap?target_level=

`,
  }),
]);

phase('Promotion Workflow');
const promotion = await parallel([
  () => agent('Implement Promotion Nomination', {
    label: 'promotion-nomination',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Promotion nomination workflow:

1. Nomination (manager or self):
   POST /api/v1/promotions/nominate
   Body:
   {
     "employee_id": "uuid",
     "nominee_level_id": "uuid",
     "nominee_reason": "text",
     "supporting_evidence": ["project_x", "mentoring_y"]
   }

2. Required materials:
   - Updated skill assessment (completed)
   - Performance review ratings (last 2 cycles)
   - Project portfolio
   - Peer feedback (minimum 3 peers)

3. Validation:
   - Employee meets minimum time-in-level (e.g., 18 months)
   - Gap analysis shows readiness
   - Performance rating ≥ 4.0

4. Status: nominated → under_review → calibration → approved/rejected

5. Notify: employee, HR, leadership

`,
  }),
  () => agent('Implement Calibration Process', {
    label: 'calibration',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Calibration process:

Calibration session: leadership reviews all nominations together.

1. List nominations for calibration:
   GET /api/v1/promotions/calibration?cycle=2025-Q2

2. Calibration notes:
   POST /api/v1/promotions/:id/calibrate
   Body:
   {
     "decision": "approve" | "defer" | "reject",
     "calibration_notes": "text",
     "adjusted_level_id?": "uuid",  // if different from nominated
     "reviewers": ["uuid", ...]  // who participated
   }

3. Compare across teams:
   - Ensure consistent standards
   - Detect bias (all promotions from one group?)
   - Adjust if necessary

4. Final approvals:
   - VP approval for IC5+ and M4+
   - CTO for IC6+ and VP+

5. Communicate decision to employee

`,
  }),
]);

phase('Individual Development Plan (IDP)');
const idp = await parallel([
  () => agent('Implement IDP System', {
    label: 'idp-system',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Individual Development Plan:

1. IDP template:
   - Career goal (next level, timeline)
   - Skill development goals (3-5 skills)
   - Project assignments (stretch assignments)
   - Training courses (specific courses)
   - Mentorship: assigned mentor
   - Check-in frequency (monthly/quarterly)

2. API:
   POST /api/v1/employees/:id/idp
   Body: { goals[], projects[], courses[], mentor_id, check_in_freq }

   GET /api/v1/employees/:id/idp?year=2025
   PATCH /api/v1/idp/:id/update

3. Progress tracking:
   - Monthly check-in: update progress
   - Mentor signs off
   - Manager review

4. Integration with career progression:
   - IDP goals aligned with promotion requirements
   - Completion rate affects promotion readiness

`,
  }),
  () => agent('Implement Mentorship Matching', {
    label: 'mentorship-matching',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Mentorship matching for career development:

1. Mentor criteria:
   - Level at least 2 above mentee
   - Expertise matches mentee's skill gaps
   - Available capacity (max 3 mentees)

2. Matching algorithm:
   - Skill gap analysis (from IDP)
   - Mentor's expertise (skills they excel at)
   - Timezone/team compatibility
   - Past mentoring relationships

3. Assignment:
   - Auto-suggest 3 mentor candidates
   - Manager approval required
   - Mentee can decline and request re-match

4. Track mentorship:
   - Meetings logged
   - Progress on IDP goals
   - Feedback surveys

5. API:
   GET /api/v1/mentors?skill_gaps=system_design,leadership
   POST /api/v1/employees/:id/assign-mentor { mentor_id }

`,
  }),
]);

phase('Analytics & Reporting');
const analytics = await parallel([
  () => agent('Create Career Progression Dashboard', {
    label: 'career-dashboard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Career progression analytics dashboard:

/admin/analytics/career-progression

Panels:
1. Headcount by level (IC1-IC5, M1-M5) - pyramid chart
2. Promotion velocity: avg time at each level (target: 18-24 months)
3. Promotion rate: % employees promoted per quarter (target: 10-15%)
4. Internal mobility: % promotions from within vs external hire
5. Skill gap heatmap: common gaps by track/level
6. Diversity by level: gender, ethnicity representation
7. IDP completion rate: % employees with active IDP
8. Mentorship coverage: % employees with assigned mentor

Filters: by team, by track, by date range

Drill-down: click level → see employees, pending promotions

`,
  }),
  () => agent('Implement Promotion Pipeline Forecast', {
    label: 'promotion-forecast',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Promotion pipeline forecasting:

1. Current pipeline:
   - Nominated (waiting for review)
   - Under review
   - Calibration pending
   - Approved (pending announcement)

2. Forecast next quarter:
   - Based on employees meeting time-in-level
   - Those with completed IDP goals
   - Performance ratings ≥4.0
   - Skill assessments at target level

3. Headcount planning:
   - Project promotions → salary/equity impact
   - Budget planning for compensation changes
   - Identify bottlenecks (not enough senior roles?)

4. API:
   GET /api/v1/admin/career/pipeline?as_of_date=
   GET /api/v1/admin/career/forecast?quarter=2025-Q3

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Test Career Progression System', {
    label: 'career-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Career progression tests:

1. Unit tests:
   - Skill gap calculation correct
   - Promotion eligibility validation (time-in-level, performance)
   - IDP progress tracking
   - Mentorship matching logic

2. Integration tests:
   - Full promotion workflow: nomination → calibration → approval
   - IDP creation and check-in flow
   - Skill assessment updates affect gap analysis

3. Permission tests:
   - Only managers can nominate
   - Only HR/leadership can calibrate/approve
   - Employees view own profile only

4. Data integrity:
   - Skill assessments cannot conflict with level requirements
   - Cannot promote below minimum time-in-level without override

5. Analytics queries fast (<500ms)

`,
  }),
  () => agent('HR System Sign-off', {
    label: 'hr-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `HR Career Progression System sign-off.

Review:
✅ Career ladder defined (IC & Manager tracks)
✅ Skill matrices for each level
✅ Employee skill profiles
✅ Promotion nomination & calibration workflow
✅ IDP system with goal tracking
✅ Mentorship matching
✅ Analytics dashboard
✅ Forecasting pipeline
✅ Integration with performance reviews
✅ Testing complete

Decision: CAREER PROGRESSION SYSTEM PRODUCTION READY.

`,
  }),
]);

log('Career Progression Tracking workflow launched');