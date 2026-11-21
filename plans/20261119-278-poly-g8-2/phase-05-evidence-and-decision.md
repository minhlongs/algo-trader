---
phase: 5
title: "Evidence and stop decision"
status: pending
priority: P2
effort: 2h
dependencies: [1, 2, 3, 4]
---

> **Bản công khai / Public copy — 2026-11-19:** Hồ sơ G8.2 tại baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`; phát hiện và kết quả TEST_ONLY bên dưới là lịch sử, không phải kết luận sau sửa G8.3. Các nguồn pháp luật là đầu mối cần luật sư xác nhận, không phải ý kiến pháp lý. Mọi gate A–F vẫn HOLD. / Historical baseline findings and TEST_ONLY results, not post-remediation assurances; legal sources require counsel validation. No activation is authorized.


## Goal / Mục tiêu
Consolidate the research into an evidence-based HOLD or readiness recommendation. Phase 05 owns the integrated gate ledger and acceptance design; other phase outputs and existing drafts are read-only. Passing this research phase does not pass any operational gate.

## Activation prerequisites to substantiate
Use the [existing provisioning checklist](../../docs/poly-g8/05-RESOURCE-PROVISIONING-CHECKLIST.md), lines 18–31 and 47–58. These are its proposed, not authoritative, gate assignments. All A–F are HOLD; confirm owners and mapping against the governing brief before operational use.

| Gate | Minimum artifact for later review | Owner | Current |
|---|---|---|---|
| A — Data rights | Written license and current terms for exact operator, geography, endpoints, processing/derivatives and retention | Founder / venue | HOLD: permission required |
| B — Vietnam legal / G12 | Independent written opinion, operator scope and completed prerequisites | Founder / counsel | HOLD |
| C — Security and recovery | Credential separation, safe dry-run, cryptographic verification, independent restore and approved retention | Independent reviewer | HOLD: not demonstrated |
| D — Infra/budget | Region, quotes and defensible $30/month envelope, including billing rounding and stop thresholds | Infra owner | HOLD |
| E — Deployment provenance and integration | Exact SHA, lockfile/toolchain, reproducible artifact and reconciled runtime/staging/manifest contracts with offline integration | Technical owner | HOLD: not demonstrated |
| F — Explicit authorization | Founder decision specifying work, scope, budget and stop conditions; never implied by plan acceptance | Founder | HOLD: not authorized |

## Steps and exit criteria
- [ ] Walk every mandatory gate against artifact, date, owner and scope. Missing, expired, mismatched or adverse evidence means HOLD, not implicit approval. Keep rights, law, economics, approval and sampling distinct; record changes only on verifiable evidence. Model denial, revoked rights, data loss and cost overrun as explicit stop paths.
- [ ] Define future checkpoints, not commands: all A–F prerequisites and separate authorization → provision and 24h qualification → independent integrity, replay and updated cost check → 7-day run → 30 continuous qualified days at the approved scope. No self-authorizing provision, silent universe reduction, dry-run count, partial-day credit or gap backfill disguised as prospective evidence. If a checkpoint fails, do not proceed; record failed intervals separately.
- [ ] Require consecutive UTC coverage from agreed windows/market membership, manifest/hash and replay parity, documented gaps, outages, rejected data and immutable provenance; dated directory names are insufficient. [IC evidence loader](../../src/desk/polymarket/ic-evidence-loader.ts#L73-L111) checks a manifest only when present and calls the distinct-date scanner, so its count alone is not proof of continuity. Maintain verified maker markouts (minimum 500 qualifying fills) and genuinely sealed-before-price, timestamped, resolved out-of-sample forecasts (minimum 150) separately; no synthetic records, hindcasts or paid model invocation. Review [G7 gaps](../../docs/poly-g7/10-KNOWN-GAPS-AND-DEVIATIONS.md) and [prospective pipeline](../../src/desk/polymarket/market-blind/market-blind-prospective-pipeline.ts#L168-L190) for calibration/chain checks beyond size alone. Keep `w_skill=0` and empirical claims locked without qualifying evidence.
- [ ] Verify the handoff quotes source and baseline for every claim, separates forecast evidence and simulated fills from real money, and does not change G11/G12/G13, G1-Soak, G2-Poly-Shadow or Public Beta. Done is a reviewable gate ledger with no unowned unknowns; it may correctly conclude HOLD.

**Risk and fallback:** high × high for accidentally treating a plan, existing code or historical drill as approval or sample. Withdraw the affected recommendation, preserve baseline counts, and require owner review before another decision. No issue update, provisioning, capture or state mutation now.

## Tóm tắt tiếng Việt / Vietnamese handoff

Ánh xạ đúng: A quyền dữ liệu; B pháp lý Việt Nam; C an toàn/toàn vẹn/khôi phục; D ngân sách; E nguồn gốc bản triển khai và tích hợp; F quyết định Founder riêng. Tất cả HOLD. Không tính dữ liệu tổng hợp, thư mục ngày rỗng hoặc receipt lặp thành bằng chứng thực. Phải duyệt riêng từng bước 24 giờ, 7 ngày, 30 ngày; không có quyền giao dịch tiền thật.
