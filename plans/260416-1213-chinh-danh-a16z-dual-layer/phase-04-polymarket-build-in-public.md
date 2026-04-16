---
phase: 04
name: Polymarket profile + build-in-public cadence
priority: P1
status: pending
blockedBy: [01]
---

# Phase 04 — Polymarket Profile + Build-In-Public Cadence

## Context Links
- `plan.md` (parent)
- `phase-01-decisions-manifesto.md` (D4 channel decision, manifesto URL)
- `phase-03-live-dashboard-d1-sync.md` (dashboard URL for linking)

## Overview
- **Priority:** P1 — community chính danh loop
- **Brief:** Thiết lập Polymarket trader profile linked tới dashboard; xác lập cadence build-in-public (weekly + monthly) tự động hoá tối đa.

## Key Insights
- Polymarket profile = on-chain participation proof; link ngược dashboard = loop credibility
- Build-in-public chống "autonomy round-up" (memory `feedback_autonomy_vs_operations`) — phải SELLS ITSELF qua transparency cadence
- Cadence tự viết khó duy trì solo ⇒ dùng OpenClaw generate draft, human review 5 phút
- D4 Phase 01 decision: Twitter + HN / Twitter / HN / tiktok-style? Default = cả hai

## Requirements

### Functional
- Polymarket profile created (wallet-linked), bio + link dashboard
- Weekly report template (batch results, P&L delta, learnings, code commits)
- Monthly milestone post template (HN-tier narrative)
- Draft generator script pull từ D1 + git log → markdown draft
- Social account(s) handle registered theo D4
- Profile + bio Polar-safe audit

### Non-functional
- Weekly draft generation < 5 min human review
- Content calendar tracked in `docs/build-in-public-log.md`
- Zero paid promotion (zero overhead)

## Architecture

### Cadence
```
Monday  → auto-generate weekly draft (OpenClaw + git log + D1 stats)
        → human review 5 min
        → post to Twitter thread
Last Fri of month
        → monthly milestone draft
        → human review 10 min
        → post to HN Show/Tell OR long-form Twitter/X
```

### Content sources per post
- Batch numbers: D1 `/api/stats`
- Code commits: `git log --since=7.days --oneline`
- Narrative: human-written top paragraph (anti-generic)
- Link: dashboard URL + manifesto URL

## Related Code Files

### To create
- `scripts/generate-weekly-draft.ts` (cron-runnable)
- `scripts/generate-monthly-milestone.ts`
- `docs/build-in-public-log.md` (append-only content log)
- `docs/social-accounts.md` (profile links, not secrets)
- `config/launchd/weekly-draft.plist` (Monday 08:00)

### To modify
- `README.md` — add "Follow along" section with channel links
- `docs/manifesto.md` — add social links in footer

## Implementation Steps

### Sub-phase 4A: Polymarket profile
1. Create Polymarket account with dedicated wallet (NOT personal trading wallet)
2. Set bio (Polar-safe): "Solo quant desk. Methodology + P&L live at [dashboard URL]."
3. Link dashboard URL in profile
4. Record profile URL in `docs/social-accounts.md`
5. Wait for first resolved trade → verify on-chain activity matches dashboard

### Sub-phase 4B: Social channels (per D4)
6. Register handle(s) theo D4 answer
7. Profile bio consistent với Polymarket (same tagline, Polar-safe)
8. Pinned post = manifesto link + dashboard link
9. Record handles in `docs/social-accounts.md`

### Sub-phase 4C: Cadence automation
10. Write `generate-weekly-draft.ts`: pull D1 stats delta (week over week), git log week, template markdown
11. Template structure: Stats · Commits · What worked · What didn't · Next week
12. Write `generate-monthly-milestone.ts`: bigger narrative, cite manifesto chapter progress
13. Setup launchd Monday 08:00 for weekly draft → write to `plans/drafts/YYYY-WW-weekly.md`
14. Human review flow: open draft, edit in 5 min, post manually first 4 weeks (until trust-auto)

### Sub-phase 4D: Feedback loop
15. Track engagement in `docs/build-in-public-log.md`: post URL, views, replies, new followers
16. After 4 weeks: review what tone/format works, adjust templates

## Todo List
- [ ] Polymarket profile + wallet
- [ ] Profile bio + dashboard link
- [ ] `docs/social-accounts.md` initial
- [ ] Social handle(s) per D4
- [ ] Pinned posts
- [ ] weekly-draft generator
- [ ] monthly-milestone generator
- [ ] Template refinement (1 manual dry-run)
- [ ] launchd weekly schedule
- [ ] README + manifesto footer links
- [ ] First weekly post published
- [ ] `build-in-public-log.md` first entry
- [ ] Commit

## Success Criteria
- Polymarket profile live, dashboard linked
- Social channel(s) live per D4
- ≥3 weekly posts published in first month
- ≥1 monthly milestone post published
- `build-in-public-log.md` tracks each post
- 0 Polar-unsafe language in all public copy

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Cadence fatigue (solo) | Auto-draft reduces to 5-min review; skip week = OK if batch empty |
| Bad batch numbers public | Ch. V anti-commitments already set expectation; honest bad-week = chính danh credit |
| Polymarket bot detection | Use personal but dedicated wallet, no automation on trades (manual review) |
| Handle squat | Register handle ASAP Phase 1 even before content |
| Post content generic (AI-slop) | Human-written top paragraph non-negotiable; template provides stats only |

## Security Considerations
- Polymarket wallet ≠ personal trading wallet (isolation)
- Seed phrase in password manager only, never in repo
- Social account OAuth secrets never in repo (keep out of `docs/social-accounts.md`)
- 2FA mandatory on all handles

## Next Steps
- Feeds back into Phase 03 credibility (community verify numbers)
- Long-term: once >55% accuracy validated, escalate to Phase 2 live funding, social cadence amplifies the proof
