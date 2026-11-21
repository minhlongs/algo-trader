---
phase: 2
title: "Vietnam legal sources"
status: pending
priority: P2
effort: 2h
dependencies: []
---

> **Bản công khai / Public copy — 2026-11-19:** Hồ sơ G8.2 tại baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`; phát hiện và kết quả TEST_ONLY bên dưới là lịch sử, không phải kết luận sau sửa G8.3. Các nguồn pháp luật là đầu mối cần luật sư xác nhận, không phải ý kiến pháp lý. Mọi gate A–F vẫn HOLD. / Historical baseline findings and TEST_ONLY results, not post-remediation assurances; legal sources require counsel validation. No activation is authorized.


## Goal / Mục tiêu
Prepare a source-backed handoff for independent Vietnam counsel; do not issue a legal opinion or engage counsel.

## Inputs and ownership
Read only: [existing counsel brief](../../docs/poly-g8/02-VIETNAM-LEGAL-G12-COUNSEL-BRIEF.md), lines 11–44. Phase 02 owns the legal-source review, not publication or legal sign-off.

| Source | Verification on 2026-11-19 |
|---|---|
| [Law 71/2025/QH15 — Ministry of Science and Technology](https://mst.gov.vn/van-ban-phap-luat/25224.htm) | Official listing confirms issuance 2025-06-14 and general effective date 2026-01-01. The listing does not expose Arts. 46–48. [Gazette PDF lead](https://congbao.cdnchinhphu.vn/180507251028987904/2026/3/5/468973-1772691656_v1_1772691967_signed.pdf) was not readable; verify signed text and amendments separately. |
| [Resolution 05/2025/NQ-CP — Government portal](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-so-5-2025-nq-cp-ve-trien-khai-thi-diem-thi-truong-tai-san-ma-hoa-tai-viet-nam-119250909184045221.htm) | Art. 18: effective 2025-09-09, five-year pilot. Art. 7(2): six months from the first Ministry of Finance service-provider license, not from enactment. Actual license date and applicability to Polymarket not verified. |
| [Decree 06/2017/NĐ-CP translation lead](https://thuvienphapluat.vn/van-ban/EN/Doanh-nghiep/Decree-06-2017-ND-CP-businessf-betting-on-horse-racing-greyhound-racing-and-international-soccer/340208/tieng-anh.aspx) | Secondary only; confirm official current text and amendments. Draft amendments are not binding sources. |

## Steps and exit criteria
- [ ] Locate official current texts or mark each gap: betting and Penal Code Arts. 321–322, securities, personal data and cross-border processing, cybersecurity, marketing/consumer protection/e-commerce, payments, foreign exchange, AML and taxes. Seek the first licensing notice in official Ministry of Finance records; no guessed date.
- [ ] Keep separate activity rows for ingestion, offline backtest, Paper SaaS, own-capital trading, advising/managing others’ capital, and custody/payments/execution/profit sharing. Include questions on operator residency/entity, territory, allowed processing, marketing and prerequisites. Founder provides private facts separately; neither facts nor privileged advice go into GitHub.
- [ ] Require dated independent written advice tied to actual operator and exact scope, current sources, completed prerequisites and reassessment triggers before `LEGAL_G12` can change. The activity matrix in draft 02 is not the A–F readiness-gate matrix.

**Risk and fallback:** high × high for stale law or treating digital-asset recognition as a permission. Record gaps and leave `LEGAL_G12=HOLD`. Withdraw unsupported interpretations; no operational changes or outreach to undo.

## Tóm tắt tiếng Việt / Vietnamese handoff

Đây là đầu mối để luật sư Việt Nam kiểm tra, không phải tư vấn pháp lý. Phải xác minh văn bản hiện hành, sửa đổi và mốc giấy phép đầu tiên; không suy quyền giao dịch từ việc công nhận tài sản số. Dữ kiện cá nhân và ý kiến luật sư giữ riêng; G12 HOLD. Không thuê luật sư hay chi tiền trong nhiệm vụ này.
