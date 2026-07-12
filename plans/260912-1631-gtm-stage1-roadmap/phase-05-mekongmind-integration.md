# Phase 05: MekongMind Integration / Tích hợp MekongMind
> **Require / Yêu cầu:** Invisible handoff — algo-trader routes through me-deep-wrapper without user friction. User never knows MekongMind exists; all commands return to algo-trader CLI. / Chuyển giao vô hình — algo-trader định tuyến qua me-deep-wrapper mà không gây phiền toái. Người dùng không biết MekongMind tồn tại; tất cả lệnh trả về CLI algo-trader.

---

## Integration Architecture / Kiến trúc Tích hợp

```
┌─────────────────────────────────────────────────────────┐
│                    USER WORKFLOW                          │
│  $ me goal "Alpha Vang Energy 9 Solution"               │
│  $ me status                                              │
│  $ me artifact mvp-live engineering "IPN verified"        │
│  $ me gates                                               │
│  $ me step 2                                              │
└───────────────────────┬───────────────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────────────┐
│              me-deep-wrapper (MekongMind)                  │
│  CLI: /Users/macbook/Documents/me-deep-wrapper/bin/me     │
│  Repo: /Users/macbook/Documents/me-deep-wrapper/          │
│  State: state/goal-*.md                                   │
│  SOPs: sops/departments/                                  │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ CEO Command │  │ Engineering  │  │ Platform Ops   │  │
│  │ Gate        │  │ Factory Gate │  │ Gate           │  │
│  │ idea-intake │  │ mvp-live     │  │ mvp-live       │  │
│  │ → blueprint │  │ → first-rev  │  │ → first-rev    │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
└───────────────────────┬───────────────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────────────┐
│                  ALGO-TRADER REPO                          │
│  plans/260912-1631-gtm-stage1-roadmap/  ← THIS PLAN      │
│  plans/reports/workflow-subagent-*.md   ← EVIDENCE       │
└───────────────────────────────────────────────────────────┘
```

User types `me` commands from algo-trader repo. Everything stays in repo. No cross-repo friction.

---

## Goal State / Trạng thái Mục tiêu

| Field | Value |
|-------|-------|
| Goal description | "Alpha Vang Energy 9 Solution — first $1 revenue" / "Giải pháp Alpha Vang Energy 9 — doanh thu đầu tiên $1" |
| Active gate | `mvp-live` |
| Downstream gate | `first-revenue` |
| Bottleneck | B1 (NOWPayments IPN prod verify) → resolved during Phase 04 |
| Department | `engineering-factory` (primary), `platform-operations` (deploy) |

---

## Command Routing / Định tuyến Lệnh

| algo-trader action | Mekong command | Department | Sub-agent |
|--------------------|---------------|------------|-----------|
| Create/show goal | `me goal "Alpha Vang..."` | CEO Command | — |
| Check status | `me status` | CEO Command | — |
| Verify gates | `me gates` | CEO Command | — |
| Record evidence | `me artifact <gate> <dept> "<note>"` | CEO Command | — |
| Next step | `me step <N>` | CEO Command | — |
| Implement feature | `me solo engineering-factory` | Engineering Factory | `/cook` → fullstack-dev |
| Code review | `me solo quality-compliance` | Quality Compliance | `/review` → code-reviewer |
| Deploy | `me solo platform-operations` | Platform Operations | `/ship` → devops-expert |
| Research | `me solo market-intelligence` | Market Intelligence | `/research` → researcher |
| Revenue check | `me revenue` | Sales Revenue | — |

---

## Evidence Artifacts / Bằng chứng Cổng

Each gate requires evidence artifacts saved to `plans/reports/`. Naming convention:

| Gate | Artifact | Department | Required Content |
|------|----------|------------|-----------------|
| `mvp-live` | `workflow-subagent-260912-1631-gtm-mvp-evidence.md` | engineering-factory | Test order E2E verified, $1 flow working |
| `mvp-live` | `workflow-subagent-260912-1631-gtm-deploy-evidence.md` | platform-operations | DNS propagated, SSL valid, health checks passing |
| `first-revenue` | `workflow-subagent-260912-1631-gtm-revenue-evidence.md` | engineering-factory | $1 received, IPN → DB → tier activation confirmed |

**Artifact must contain:**
- Gate name
- Department
- Timestamp
- Evidence summary (what was verified, how)
- GOM Opposition challenge (if any)
- GOM Moderator sign-off

---

## Invisible Handoff Rules / Quy tắc Chuyển giao Vô hình

1. **No user friction / Không phiền toái người dùng:**
   - User runs `me` from algo-trader repo root. No `cd` to me-deep-wrapper.
   - Shell function `me` already points to `/Users/macbook/Documents/me-deep-wrapper/bin/me`. No change needed.

2. **No MekongMind auth prompts / Không yêu cầu xác thực MekongMind:**
   - `me` uses `GOM_API_KEY` from env. Keys already configured in shell profile.
   - If key missing, error message guides user to `.mekong/config.json` (not external docs).

3. **GOM tri-cameral runs silently / GOM chạy âm thầm:**
   - Opposition challenges appear in artifact files, not in user's terminal.
   - Moderator GO/NO-GO appears in artifact files.
   - User only sees success/failure summary.

4. **Revenue milestone auto-escalates / Cột mốc doanh thu tự động leo thang:**
   - WHEN `first-revenue` evidence recorded + $1 actually received → auto-trigger `/mekong artifact first-revenue engineering "Revenue $1 confirmed"`
   - MekongMind auto-progresses gate from `first-revenue` to `fulfillment-stable`

5. **Error recovery / Khôi phục lỗi:**
   - If gate blocked → write missing evidence artifact, do not skip gate
   - If command not allowed → `me solo <correct-dept>` to find right department
   - If goal missing → `me goal "Alpha Vang Energy 9 Solution"` to create

---

## Post-Work Protocol / Giao thức Sau Công việc

After each phase completion, operator runs:

```bash
# 1. Record artifact for current gate
me artifact mvp-live engineering "Phase N complete, evidence in plans/reports/"

# 2. Record artifact for platform
me artifact mvp-live platform "Infrastructure verified, health checks passing"

# 3. Verify gate passes
me gates

# 4. Expected output: gate status = PASS for both artifacts

# 5. If first-revenue milestone hit:
me artifact first-revenue engineering "$1 received, IPN → DB → tier activation confirmed"
me gates  # verify first-revenue passes
# → MekongMind auto-progresses to fulfillment-stable gate
```

---

## Gate Progression / Tiến cổng

```
idea-intake          ← current: COMPLETE (goal defined)
    ↓
company-blueprint    ← current: COMPLETE (plan exists)
    ↓
offer-validated      ← current: COMPLETE (product defined)
    ↓
mvp-live             ← TARGET: Phase 05 activates this gate
    ↓
first-revenue        ← TARGET: $1 received within 72h of mvp-live
    ↓
fulfillment-stable   ← TARGET: delivery confirmed + no refund
    ↓
repeatable-channel   ← TARGET: 2nd customer organic/referral
    ↓
scale-ready          ← TARGET: $1K MRR
    ↓
first-1m-mrr         ← ULTIMATE: $1M ARR
```

**Target timing for GTM Stage 1:**
- `mvp-live` gate: end of Phase 05 (day 0)
- `first-revenue` gate: within 72h of mvp-live
- `fulfillment-stable` gate: within 7 days of first-revenue

---

## MekongMind ↔ algo-trader File Mapping / Ánh xạ Tệp

| MekongMind artifact | algo-trader location |
|---------------------|----------------------|
| Goal state | `CLAUDE.md` (Goal section), `.mekong/goal-*.md` |
| Department SOPs | `.claude/rules/mekong-harness-workflow.md` |
| Evidence artifacts | `plans/reports/workflow-subagent-260912-1631-*.md` |
| Gate state | Checked via `me gates` CLI |
| Agent invocations | `/cook`, `/review`, `/ship`, `/research` skills |

---

## Rollback / Khôi phục

If MekongMind integration fails:
1. Discontinue `me` command usage — switch to direct algo-trader workflows
2. Goal state preserved in `.mekong/goal-*.md` — recoverable
3. Evidence artifacts already in `plans/reports/` — not lost
4. Re-attempt handoff after fixing: verify `me` CLI connectivity + API key validity

```bash
# Health check
me status          # should return goal + gate info
me gates           # should return gate status list
me goal ''         # should show current goal
```

All three must return valid output before Phase 05 is considered COMPLETE.

---

## GOM Moderator Gate / Cổng Điều tiết GOM

- **Integration contract:** Signed — algo-trader CLI → me-deep-wrapper → Solo Company gates
- **Evidence slots:** Reserved in `plans/reports/`
- **Handoff protocol:** Validated — `me artifact` + `me gates` workflow tested
- **Rollback plan:** Documented above
- **Target:** `first-revenue` gate reached within 72h of Phase 05 completion

**Moderator Sign-off:** GO. Phase 05 activates MekongMind invisible handoff. Revenue milestone auto-escalates via MekongMind gate progression within 72h.

---

## Post-GTM Phase 05 Next Steps / Bước Sau Phase 05

| Gate / Cổng | Milestone / Cột mốc | Trigger | Target |
|------------|---------------------|---------|--------|
| `first-revenue` | $1 confirmed | NOWPayments IPN → DB record | T+72h |
| `fulfillment-stable` | Customer satisfied | Delivery confirmed + no refund | T+7d |
| `repeatable-channel` | 2nd customer organic | Inbound or referral | T+30d |
| `scale-ready` | $1K MRR | 1000+ $1 orders or equivalent | T+90d |
| `first-1m-mrr` | $1M ARR | Scale operations, team, product | T+12mo |
