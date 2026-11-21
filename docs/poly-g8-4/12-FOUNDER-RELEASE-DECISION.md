# POLY-G8.4 — Founder Release Decision Package

- **Document ID:** `POLY-G8.4-12`
- **Date:** 2026-11-21
- **Audience:** Founder / Investment Committee
- **Core Principle:** Economic truth before deployment. Preserve capital before pursuing alpha.

---

## 1. What CAN Be Shipped (After Owner Review & Green CI)

All items below are **reviewable Draft PRs** containing verified engineering, security, reliability, and documentation improvements with zero production deployment, zero live trading, and zero external data ingestion:

| Order | PR | Branch | HEAD SHA | Scope | Risk / Impact |
|---|---|---|---|---|---|
| 1 | `#288` | `fix/poly-g8-4-security-283` | `156642fd` | Reconcile `package-lock.json` (`better-auth@1.7.7`, `proxy-addr@2.0.8`) for Issue `#283` | Low; lockfile-only; eliminates 2 critical `npm audit` findings |
| 2 | `#282` | `docs/poly-g8-2-sanitized` | `b54e349e` | Sanitized G8.2 decision dossier (11 docs) | Zero runtime impact; 11/11 CI green |
| 3 | `#285` | `fix/poly-g8-3-evidence-integrity` | `784d6e98` | G8.3 areas A–F + G8.4 backfill attestation, scorecard default path, and upload timeout hardening | Bounded to `infra/poly-collector/`, `sidecars/poly-book/`, `market-blind/`, `scripts/poly-g7-scorecard.ts`; zero Paper Beta regression |
| 4 | `#289` | `fix/poly-g8-4-reliability-286` | `a9463d95` | `StrategyRunner` re-entrancy guard + offline lifecycle test isolation (`#286`); GhostGuard `<100 ms` preserved | Low; improves runtime safety & CI determinism |
| 5 | `#290` | `chore/poly-g8-4-lint-284` | `7e7faca0` | Remove 55 genuine unused imports across 42 files (`143 -> 88 <= 100`) (`#284`) | Low; zero overlap with `#285`/`#289` |
| 6 | G8.4 Docs PR | `docs/poly-g8-4-ic-release-package` | *(current PR)* | 13 IC release reports + `ic-roadmap-manifest.json` | Docs-only; zero runtime impact |

---

## 2. What CANNOT Be Shipped / Remains Strictly Blocked

1. **Continuous 24/7 L2 Data Collection & VPS/R2 Provisioning (`VPS_R2_ACTIVATION = HOLD`)** — Blocked by `DATA_LICENSE = HOLD`, `INFRA_BUDGET = HOLD`, and `LINUX_SYSTEMD_RUNTIME = NOT_TESTED`.
2. **Paper Beta `USER_001` External Invite (`USER_001_INVITE = HOLD`)** — Blocked until Founder confirms deployed Cloudflare Worker (`https://api.cashclaw.cc`) build provenance (`better-auth@1.7.7`, `proxy-addr@2.0.8`).
3. **Any Empirical Alpha Claim (`MAKER_ALPHA`, `NEGRISK_ALPHA`, `MARKET_BLIND_ALPHA = INSUFFICIENT_DATA`)** — `0/30` L2 days, `0/500` maker fills, `0/150` resolved prospective OOS forecasts.
4. **Micro-Pilot or Real-Money Trading (`ECONOMIC_G11 = HOLD`, `LEGAL_G12 = HOLD`, `FOUNDER_G13 = HOLD`, `REAL_MONEY_TRADING = DISABLED`)** — `LIVE_TRADING_ENABLED=false` remains hard-locked; zero wallets, zero order signing, zero ExchangeV3 live calls.

---

## 3. Concrete Founder Decisions Required Next (Ordered)

1. **Decision 1 (Immediate — Engineering Merge):** Review and manually merge Draft PRs `#288` → `#282` → `#285` → `#289` → `#290` → G8.4 Docs PR after verifying green CI on each final HEAD.
2. **Decision 2 (Paper Beta Security Gate):** Confirm deployed Cloudflare Worker (`https://api.cashclaw.cc`) dependency provenance (`pnpm-lock.yaml` with `better-auth@1.7.7` & `proxy-addr@2.0.8`) or redeploy after `#288` merges before unblocking Issue `#275` (`USER_001`).
3. **Decision 3 (Gate A — Data Rights):** Send the sanitized outbound Polymarket data-rights inquiry (`READY_FOR_FOUNDER_SEND` in PR `#282`) from an authorized Founder identity. Do not start `IC_DAY_0` until written permission is received.
4. **Decision 4 (Gate D — Budget):** Approve or revise the monthly collector + research budget (`$31.06–$59.32/mo` collector-only pre-tax/pre-license vs. `$500–$800/mo` PDF full IC research model).
5. **Decision 5 (Gate B — Legal):** Decide timing and scope for independent Vietnam legal counsel engagement (`LEGAL_G12`) before any future Stage 5 micro-pilot consideration.

---

## 4. Bilingual Executive Summary (Tóm Tắt Điều Hành — Tiếng Việt)

- **Có thể review & merge sau khi CI xanh:** 6 Draft PR độc lập (`#288` bảo mật lockfile, `#282` hồ sơ G8.2 đã làm sạch, `#285` toàn vẹn dữ liệu G8.3 + vá 3 lỗi backfill/path/timeout, `#289` chống re-entrancy StrategyRunner & giữ nguyên ngưỡng GhostGuard `<100 ms`, `#290` giảm 55 cảnh báo ESLint `143 → 88`, và PR tài liệu G8.4).
- **Chưa được phép kích hoạt:** Không tự động merge, không thuê VPS/R2, không thu thập dữ liệu liên tục 24/7, không mở ví/ký lệnh thật (`LIVE_TRADING_ENABLED=false`), không tuyên bố alpha thực nghiệm (`0/30` ngày L2, `0/500` maker fills, `0/150` dự báo OOS).
- **Quyết định tiếp theo của Founder:** (1) Review và merge các Draft PR theo thứ tự phụ thuộc; (2) Xác nhận phiên bản `better-auth@1.7.7` trên Worker production trước khi mời `USER_001`; (3) Gửi thư xin phép quyền dữ liệu Polymarket (`READY_FOR_FOUNDER_SEND`); (4) Phê duyệt ngân sách collector (`$31.06–$59.32/tháng` chưa gồm thuế/bản quyền) trước khi khởi động `IC_DAY_0`.
