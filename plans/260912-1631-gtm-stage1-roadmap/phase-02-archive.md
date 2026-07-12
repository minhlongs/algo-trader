# Phase 02: Archive Old GTM / Lưu Trữ GTM Cũ
> **Require / Yêu cầu:** Migrate valid assets → freeze old references → verify zero forward links. No new plan may reference an archived plan until it is unarchived. / Di chuyển tài sản hợp lệ → đóng băng tham chiếu cũ → xác minh không có liên kết tiến. Không plan mới nào được trỏ đến plan đã lưu trữ cho đến khi khôi phục.

---

## Inventory / Kiểm kê

Source: `plans/` directory. Scanned 2026-07-12.

| Path | Date | Content Summary | Action |
|------|------|-----------------|--------|
| `../260704-0826-gtm-execution/` | 2026-07-04 | Original GTM execution strategy, pricing tiers, target segments | **Keep** — active reference |
| `../260708-1430-revenue-activation-end-to-end/` | 2026-07-08 | Revenue flow end-to-end: signup → payment → activation | **Keep** — flow reference |
| `../260708-1730-staging-payment-e2e/` | 2026-07-08 | Staging payment E2E test suite (NOWPayments sandbox) | **Keep** — test reference |
| `../260708-2000-billing-polish-mcp/` | 2026-07-08 | Billing polish + MCP integration | **Keep** — incorporated into Phase A of payment-gate plan |
| `../260708-0255-phase-a-billing-polish-plus-phase-b-mcp/` | 2026-07-08 | Same content as above, older timestamp | **Archive** — superseded by 260708-2000 |
| `../260708-2257-advanced-risk-management/` | 2026-07-08 | Risk management framework, blocked by payment gate | **Keep** — blocked, not stale |
| `../260708-2257-marketplace-multi-tenant/` | 2026-07-08 | Marketplace multi-tenant isolation | **Keep** — dependent on risk mgmt |
| `../260704-0848-live-trading/` | 2026-07-04 | Live trading integration — superseded by 260709+ | **Archive** |
| `../260621-1649-strategy-marketplace-implementation/` | 2026-07-04 | Strategy marketplace implementation | **Keep** — live marketplace |
| `../260702-1411-go-live-week-1/` | 2026-07-02 | Go-live week 1 checklist | **Keep** — historical |
| `../260702-1516-monitoring-stack/` | 2026-07-02 | Monitoring stack setup (Grafana, alerts) | **Keep** — actively used |
| `../260702-1607-weeks-3-4-growth/` | 2026-07-02 | Weeks 3-4 growth plan | **Archive** — pre-revenue, superseded |
| `../260702-2246-revenue-strategy-performance/` | 2026-07-03 | Revenue strategy performance tracking | **Keep** — tracking still active |
| `../260703-0024-next-wave/` through `next-wave-III` | 2026-07-03-07 | Design/UX iteration waves | **Keep** — design reference |
| `../260703-1049-backend-infra-wave/` | 2026-07-03 | Backend infra improvements | **Keep** — infra still active |
| `../260703-1141-revenue-readiness/` | 2026-07-03 | Revenue readiness assessment | **Keep** — readiness criteria still valid |
| `../260703-1337-enterprise-one-pager/` | 2026-07-03 | Enterprise sales one-pager | **Keep** — sales doc |
| `../260703-1450-ultracode-next-wave/` | 2026-07-03 | Ultracode integration | **Archive** — scope deferred |
| `../260703-1534-testing-next-wave/` | 2026-07-03 | Testing improvements | **Keep** — test coverage still relevant |
| `../260703-1727-next-wave-III-brainstorm/` | 2026-07-04 | Brainstorm session | **Archive** — ideation, not executable |
| `../260704-0023-ai-co-pilot-next-wave/` | 2026-07-04 | AI co-pilot feature | **Archive** — future roadmap |
| `../260704-0857-strategy-leaderboard/` | 2026-07-04 | Strategy leaderboard | **Keep** — marketplace feature |
| `../260704-0941-signals-api-marketplace/` | 2026-07-04 | Signals API marketplace | **Keep** — revenue feature |
| `../260705-0025-bizplan-os/` | 2026-07-05 | Business plan OS | **Archive** — standalone tool, not algo-trader |
| `../260705-0025-signals-api-ideation/` | 2026-07-05 | Signals API ideation | **Keep** — merged into 260704-0941 |
| `../260708-0000-revenue-ready-signals-api/` | 2026-07-08 | Revenue-ready signals API | **Keep** — active revenue feature |
| `../260708-2257-marketplace-multi-tenant/` | 2026-07-08 | Marketplace multi-tenant | **Keep** — active |
| `../260709-1600-billing-polish-mcp-execution.md` | 2026-07-09 | Billing polish MCP execution plan (flat file) | **Archive** — superseded |
| `../260712-1110-unblock-payment-gate/` | 2026-07-12 | Payment gate unblock plan | **Keep** — this GTM depends on it |
| `../260712-1246-cf-only-migration/` | 2026-07-12 | CF-only migration | **Keep** — infra active |

---

## Archive Actions / Hành Động Lưu trữ

K = Keep (no action). A = Move to `plans/reports/archive-<date>-<slug>/`.

| Path | Action | Destination |
|------|--------|-------------|
| `260708-0255-phase-a-billing-polish-plus-phase-b-mcp/` | A | `plans/reports/archive-260708-billing-polish-legacy/` |
| `260704-0848-live-trading/` | A | `plans/reports/archive-260704-live-trading/` |
| `260702-1607-weeks-3-4-growth/` | A | `plans/reports/archive-260702-weeks-3-4-growth/` |
| `260703-1450-ultracode-next-wave/` | A | `plans/reports/archive-260703-ultracode-next-wave/` |
| `260703-1727-next-wave-III-brainstorm/` | A | `plans/reports/archive-260703-brainstorm/` |
| `260704-0023-ai-co-pilot-next-wave/` | A | `plans/reports/archive-260704-ai-co-pilot/` |
| `260705-0025-bizplan-os/` | A | `plans/reports/archive-260705-bizplan-os/` |
| `260708-1600-billing-polish-mcp-execution.md` | A | `plans/reports/archive-260708-billing-polish-flat/` |

**Stale files to delete / Xóa file lỗi thời:**

- Any `.tmp`, `.bak`, `.old` in `plans/`
- Duplicate `.md` flat files with same slug as directory plans

---

## Freeze Forward References / Đóng Băng Tham Chiếu

After archive move, run grep to find any remaining forward references:

```bash
grep -rl "260708-0255\|260704-0848\|260702-1607\|260703-1450\|260703-1727\|260704-0023\|260705-0025" plans/ --include="*.md"
```

Any matches found = broken reference. Fix by updating to active plan or deleting line.

**Rule:** New plans in `plans/` must only reference plans NOT in archive.

---

## GOM Opposition Challenge / Thách Thức Phản Biện GOM

| Challenge | Response |
|-----------|---------|
| O: "260702-1411 go-live-week-1 has live deployment notes — moving it risks losing operational knowledge" | G: It is a completed checkpoint, not an active plan. Content merged into `260712-1246-cf-only-migration`. Archive preserves it. |
| O: "260708-2257 risk-mgmt is listed as keep but is blocked — should it be archived?" | G: Blocked does not mean stale. It is a required upstream for marketplace-multi-tenant. Keep until unblocked or superseded. |
| O: "260705-0025 bizplan-os is a standalone tool, not algo-trader — why was it in plans/ at all?" | G: Historical artifact from ideation phase. Archive preserves provenance. |

**Moderator Decision:** Archive moves approved. G1 (GOV) responses accepted. No unresolved P0 findings. GO → Phase 03.

---

## Verification Checklist / Kiểm Tra Xác minh

- [ ] All archive destination directories created under `plans/reports/archive-*/`
- [ ] Source files moved (not copied — `git mv` recommended)
- [ ] Forward reference grep returns zero matches
- [ ] `plans/` directory listing confirmed clean (no orphaned plans)
- [ ] GOM Opposition sign-off: no active dependencies on archived paths
