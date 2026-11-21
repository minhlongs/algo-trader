---
title: "POLY-G8.2 (#278) — Evidence-source research and readiness"
description: "Reconcile data rights, Vietnam legal sources, cost and evidence readiness without activating collection."
status: pending
priority: P2
effort: 10h
issue: 278
branch: docs/poly-g8-2-sanitized
tags: [research, polymarket, governance]
blockedBy: []
blocks: []
created: 2026-11-19
---

> **Bản công khai / Public copy — 2026-11-19:** Hồ sơ G8.2 tại baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`; phát hiện và kết quả TEST_ONLY bên dưới là lịch sử, không phải kết luận sau sửa G8.3. Các nguồn pháp luật là đầu mối cần luật sư xác nhận, không phải ý kiến pháp lý. Mọi gate A–F vẫn HOLD. / Historical baseline findings and TEST_ONLY results, not post-remediation assurances; legal sources require counsel validation. No activation is authorized.


# POLY-G8.2 — Evidence-source research plan

## Outcome and boundaries
Deliver a traceable readiness dossier: what is supported, what is still missing, and which decisions remain blocked. This is not a data license, legal opinion, spending approval, empirical sample or activation decision. [Issue #278](https://github.com/minhlongs/algo-trader/issues/278) distinguishes merged engineering from outstanding empirical and human gates. Baseline recorded by existing drafts: `7319b8d04305d14c95cd366a1593d3bdfa9235ec`.

**This directory is a planning record.** The five documents under `docs/poly-g8/` are the preparation deliverables; they do not authorize external correspondence, hiring counsel, paid inference, provisioning or capture. Preserve 150 markets, rolling 30-day WAL and Parquet design and the $30/month infrastructure ceiling. No orders, signing, deposits, withdrawals, custody, real funds or redistribution. Public Beta, production routes, integrations and existing data remain untouched. No migration, deployment, capture drill or auto-merge. Keep `LIVE_TRADING_ENABLED=false`; G1-Soak and G2-Poly-Shadow locked.

## Existing work acknowledged
- Data-rights matrix and unsent permission request already exist: `docs/poly-g8/01-POLYMARKET-DATA-RIGHTS-ASSESSMENT.md:5–52`. Terms and geographic restrictions were re-read from official sources on 2026-11-19; permission remains required.
- Counsel brief and legal-source leads already exist: `docs/poly-g8/02-VIETNAM-LEGAL-G12-COUNSEL-BRIEF.md:22–44`. Official Law 71 metadata and Resolution 05 text were rechecked; unreadable consolidated text, current amendments and the first-license trigger remain gaps.
- VPS/R2 estimates already exist: `docs/poly-g8/03-VPS-R2-COSTED-DEPLOYMENT-PLAN.md:5–60`. DigitalOcean dimensions and R2 pricing were rechecked; use the rounded no-allowance cases in the cost plan, not prorated operations.
- The [security and rollback draft](../../docs/poly-g8/04-DATA-SECURITY-AND-ROLLBACK.md) and [provisioning checklist](../../docs/poly-g8/05-RESOURCE-PROVISIONING-CHECKLIST.md) add code inspection, reproduced TEST_ONLY results and the A–F gates, all HOLD. Reuse these with their stated limits; not cloud or market evidence. Do not restart completed source gathering.

## Phases and dependencies
| Phase | Owner | Blockers | Effort |
|---|---|---|---|
| [01 — Data rights](phase-01-data-rights.md) | Rights researcher | Existing draft and current official terms | 2h |
| [02 — Vietnam legal sources](phase-02-vietnam-legal-sources.md) | Legal-source researcher | Existing brief; private operator facts remain a counsel prerequisite | 2h |
| [03 — Cost and capacity](phase-03-cost-and-capacity.md) | Infrastructure researcher | 01 and 02 findings, not legal clearance | 2h |
| [04 — Offline readiness design](phase-04-offline-readiness.md) | Technical reviewer | 01 and 02 restrictions | 2h |
| [05 — Evidence and decision](phase-05-evidence-and-decision.md) | Evidence lead | 01–04 | 2h |

Phases 01/02 and then 03/04 may research in parallel with disjoint ownership. This estimate covers desk work, not counsel turnaround, licensing negotiations or future field qualification. No live task-management tool is exposed; phase checklists are the handoff. No session-state activation is attempted because it would write outside `plans`.

## Evidence and validation contract
For each decision-bearing claim record issuer, canonical URL or commit-pinned repository path and lines, clause/table, effective/revision date, access date, short excerpt or calculation, limitations, owner and recheck trigger. Distinguish verified text, historical observation, assumption and unresolved question. Failed retrieval is a gap, not corroboration. Full source details and test matrices appear in phases.

Unit-level checks cover arithmetic, units, labels and source metadata; integration checks reconcile rights/legal constraints with processing, capacity and gate dependencies; end-to-end validation is a desk walkthrough from permission to evidence eligibility, including denial and missing-data cases. See the checklist for observed TEST_ONLY results; no live behavior is claimed. Validate plan links/schema with the installed CLI and check the final filesystem diff. Later execution must use current CLI help to change status, not manually alter status cells.

## Compatibility, rollback and current verdict
This is additive planning only; there are no schemas, callers, shared runtime state or user migrations to change. Roll back any phase by withdrawing its unsupported assertions and marking dependent decisions HOLD; never delete existing data, drafts or approvals. No parallel phase owns the same prospective dossier file. Final integration is read-only across phase-owned outputs.

`DATA_LICENSE=PERMISSION_PENDING`; `LEGAL_G12=HOLD`; `INFRA_PREFLIGHT=HOLD`; `VPS_R2_PROVISIONING=NOT_AUTHORIZED`; `ECONOMIC_G11=HOLD`; `FOUNDER_G13=HOLD`; real-money trading disabled. At the documented baseline: `0/30` continuous L2 days, `0/500` qualifying maker fills, `0/150` resolved prospective forecasts; empirical verdicts stay `INSUFFICIENT_DATA`, `w_skill=0`. See `docs/poly-g7/10-KNOWN-GAPS-AND-DEVIATIONS.md:15` and issue #278's engineering merge update; these are recorded baseline counts, not a fresh capture audit.

## Concerns requiring resolution
Written permission and operator classification; current authoritative legal texts and independent counsel; exact G7.5 throughput provenance; rounded billing, taxes and permitted region; collector-to-uploader compatibility; qualified continuity versus merely dated files. No unknown is converted into PASS. At the G8.2 baseline, the next Founder decision concerned authorizing the draft rights inquiry; under G8.3 that single inquiry is authorized, leaving truthful sender-identity completion and Founder dispatch as the next step—not provisioning or capture.

## Tóm tắt tiếng Việt / Vietnamese handoff

Hồ sơ lịch sử G8.2 giữ nguyên phạm vi 150 thị trường, lưu WAL/Parquet 30 ngày và trần 30 USD/tháng. Đây không phải giấy phép dữ liệu, ý kiến luật sư hoặc lệnh triển khai. G8.3 đã cho phép sửa lỗi ngoại tuyến và chuẩn bị một thư xin quyền; chưa xác minh tài khoản gửi nên dùng READY_FOR_FOUNDER_SEND. A–F, G11/G12/G13 vẫn HOLD; không mua, cấp phát, thu thập hoặc giao dịch.
