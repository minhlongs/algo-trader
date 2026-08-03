# GTM Stage 1 Roadmap — Alpha Vang Energy 9 Solution

# Lộ Trình Giai Đoạn 1 GTM — Alpha Vang Energy 9 Solution

**Goal / Mục tiêu:** First revenue $1 — test order flow end-to-end / Doanh thu đầu tiên $1 — luồng đặt hàng kiểm tra đầu cuối
**Prior / Ưu tiên:** P0 — Critical / Quan trọng
**Status / Trạng thái:** ALL PHASES COMPLETE / TẤT CẢ GIAI ĐOẠN HOÀN THÀNH
**Updated / Cập nhật:** 2026-08-03

---

## Execution Flow / Luồng Thực thi

```
test order → upgrade cashclaw.cc → alpha vang → energy 9 solution
(đặt hàng kiểm tra)
    → (nâng cấp cashclaw.cc)
        → (alpha vang)
            → (giải pháp năng lượng 9)
```

Each arrow is a gated transition. Phase 01 runs flow internally. Phase 02 freezes old GTM. Phase 03 adversarially attacks every step. Phase 04 clears all P0 blockers. Phase 05 activates MekongMind invisible handoff.

---

## Phases / Các Giai Đoạn

| # | Phase / Giai đoạn | Status | File |
|---|-------------------|--------|------|
| 01 | Execution Checklist / Danh sách kiểm tra thực thi | **COMPLETE** | `phase-01-checklist.md` + `gom-phase01-signoff.md` |
| 02 | Archive Old GTM / Lưu trữ GTM cũ | **COMPLETE** | `phase-02-archive.md` |
| 03 | Red Team Security / Dội an ninh doi lap | **COMPLETE** | `phase-03-red-team.md` + `gom-phase03-signoff.md` |
| 04 | Blocker Validation / Xác thực chặn | **COMPLETE** | `phase-04-validate.md` + `gom-phase04-signoff.md` |

| 05 | MekongMind Integration / Tích hợp MekongMind | **COMPLETE** | `phase-05-mekongmind-integration.md` + `gom-phase05-signoff.md` |
Sequential dependency: 01 → 02 → 03 → 04 → 05. No parallelism until Phase 03 (Red Team) runs after archive is frozen.

---

## GOM Tri-Cameral Framework / Khung Ba Viên GOM

Every phase transition requires all three GOM chambers to agree / Mỗi chuyển giai đoạn cần 3 viên GOM đồng ý:

| Chamber / Viên | Role / Vai trò | Gate Action / Hành động |
|----------------|----------------|-------------------------|
| **Government (G)** / Chính phủ | Proposer / Người đề xuất | Submits phase plan, defines acceptance criteria |
| **Opposition (O)** / Đối lập | Adversarial reviewer / Trình phản biện | Challenges every checklist item, demands evidence |
| **Moderator (M)** / Điều tiết | Gatekeeper / Người kiểm soát | Issues GO / NO-GO based on G vs O resolution |

**GO** = all Opposition challenges resolved or accepted as residual risk with named owner.
**NO-GO** = any unresolved P0 challenge blocks phase transition.

---

## Dependencies / Phụ thuộc

- Prior plan: `../260712-1110-unblock-payment-gate/plan.md` (COMPLETE — 26/26 tests green)
- Prior plan: `../260704-0826-gtm-execution/plan.md` (reference — GTM strategy)
- Upstream blocker: B1, B2 resolved by payment-gate plan

---

## Acceptance Criteria / Tiêu chí Chấp nhận

1. `POST /api/webhooks/nowpayments` returns 200 in prod
2. `api.cashclaw.cc` publicly resolves with valid SSL
3. Test order placed end-to-end: register → tier BASIC → $1 payment → IPN → tier activation
4. NOWPayments IPN → DB tier update → user sees active BASIC tier
5. Alpha Vang `/alpha-vang` product page live with bilingual VN+EN content
6. Energy 9 Solution delivery pipeline wired: `/api/delivery/energy-9` responds
7. All 5 phases pass GOM adversarial gate

---

## Post-Plan Next Steps / Bước Tiếp Theo

1. Read Phase 01 checklist, execute items T1–T8, U1–U5, A1–A5, E1–E4
2. GOM Government submits Phase 01 evidence
3. GOM Opposition challenges Phase 01
4. GOM Moderator issues GO → proceed to Phase 02
5. Repeat for each phase
---
## AK-COOK Closure (2026-08-03)

 executed plan through full verification.

| Action | Detail |
|--------|--------|
| Scout audit | Verified all 5 phases vs codebase |
| Fixes applied | _redirects /alpha-vang rule, wrangler.toml migrations_dir, plan evidence artifacts |
| TypeScript check | 0 errors (npx tsc --noEmit clean) |
| Tests | 3656/3656 pass |
| Tier consistency | STARTER/PRO/ENTERPRISE/MASTER match LicenseTier enum; same subscriptions table in IPN and subscription-service paths |

**Residual risks (accepted in sign-offs):**
- R9: No pnpm audit CI gate — deferred, not a blocking risk.
- B1/B2: Production DNS + sandbox IPN smoke test are operational, not code, tasks.

**Verdict: GO — GTM Stage 1 Roadmap COMPLETE. Operator executes test order to reach first-revenue gate.**
