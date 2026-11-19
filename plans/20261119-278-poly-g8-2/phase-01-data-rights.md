---
phase: 1
title: "Polymarket data rights"
status: pending
priority: P2
effort: 2h
dependencies: []
---

> **Bản công khai / Public copy — 2026-11-19:** Hồ sơ G8.2 tại baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`; phát hiện và kết quả TEST_ONLY bên dưới là lịch sử, không phải kết luận sau sửa G8.3. Các nguồn pháp luật là đầu mối cần luật sư xác nhận, không phải ý kiến pháp lý. Mọi gate A–F vẫn HOLD. / Historical baseline findings and TEST_ONLY results, not post-remediation assurances; legal sources require counsel validation. No activation is authorized.


## Goal / Mục tiêu
Verify the published terms and determine which permissions the proposed Vietnam-operated workflow still needs. Public access is not permission.

## Read-only inputs and ownership
[Existing data-rights draft](../../docs/poly-g8/01-POLYMARKET-DATA-RIGHTS-ASSESSMENT.md), lines 5–52, already contains the matrix and unsent letter; neither is changed here. This phase owns only the rights-source reconciliation.

Rechecked 2026-11-19: [Polymarket Terms](https://polymarket.com/tos), effective 2026-08-11, §4.2: Capital Market Client written agreement requirement and coverage of raw, derived, aggregated or anonymized data including API/on-chain access; separate scraping prohibition. Readable online, not an authenticated archived copy. [Geographic restrictions](https://help.polymarket.com/en/articles/13364163-geographic-restrictions), modified 2026-10-29: Vietnam absent from the returned list; the page forbids evasion and does not grant data or local legal rights.

## Steps and exit criteria
- [ ] Record the exact dated clauses and distinctions for programmatic access, internal use, 30-day retention, backtesting, processors, derived outputs and sharing. Record each outcome as `REQUIRES_WRITTEN_PERMISSION`, `REQUIRES_COUNSEL`, `PROHIBITED`, `UNKNOWN` or `CONFIRMED_PERMITTED` only with affirmative evidence. Reassess if terms, operator, scope or region change.
- [ ] Check that the unsent request covers operator classification, licensed endpoints/rates, 150 markets, WAL and Parquet, retention/deletion/backup, processors and regions, commercial research, reporting, fee and revocation. Leave it unsent; founder review does not itself confer rights.
- [ ] Confirm every permission gap has an owner and no planned ingestion is labeled permitted based on public connectivity or geography alone.

**Risk and fallback:** high × high if access is mistaken for consent. Keep Gate A blocked until written approval covers the actual operator and data flow. Withdraw unsupported conclusions; no data or service to roll back.

## Tóm tắt tiếng Việt / Vietnamese handoff

Mục tiêu là đối chiếu quyền dữ liệu, không tự cấp phép. Giữ việc thu thập tắt; Founder chỉ gửi thư A–H trong tài liệu 01 sau khi xác minh danh tính thật. Endpoint công khai và việc Việt Nam không nằm trong danh sách cấm không thay thế quyền bằng văn bản. Chưa có thư gửi hoặc thỏa thuận; Gate A HOLD.
