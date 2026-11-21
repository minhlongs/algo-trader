---
phase: 4
title: "Offline readiness design"
status: pending
priority: P2
effort: 2h
dependencies: [1, 2]
---

> **Bản công khai / Public copy — 2026-11-19:** Hồ sơ G8.2 tại baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`; phát hiện và kết quả TEST_ONLY bên dưới là lịch sử, không phải kết luận sau sửa G8.3. Các nguồn pháp luật là đầu mối cần luật sư xác nhận, không phải ý kiến pháp lý. Mọi gate A–F vẫn HOLD. / Historical baseline findings and TEST_ONLY results, not post-remediation assurances; legal sources require counsel validation. No activation is authorized.


## Goal / Mục tiêu
Define how a future authorized collector and archive would be verified offline; no implementation, test execution or capture now. Own the technical/runbook and synthetic-drill design only. Read the [security and rollback draft](../../docs/poly-g8/04-DATA-SECURITY-AND-ROLLBACK.md), especially lines 15–59 and 105–130; its reported TEST_ONLY checks are prior evidence, not results of this plan. Do not modify it.

## Flow and source checks
Proposed flow: licensed read-only feed → isolated non-root collector normalizes and writes local WAL → closed segments and corresponding Parquet → SHA-256 manifest → separate least-privilege uploader → private R2 → clean download, checksum and deterministic replay. Untrusted or incomplete evidence stays in quarantine. No trading credentials, SaaS data or public bucket.

- [Rust service template](../../infra/poly-collector/poly-book-collector.service#L18-L46) starts `poly-book ingest` with Parquet and gives the collector an R2 environment file; credential separation is a proposal, not current behavior. [TS CLI](../../scripts/poly-l2-collector.ts#L59-L91) starts its own runtime and performs a local copy for its restore option. A local parity pass is not cloud restore proof.
- [Uploader](../../infra/poly-collector/poly-collector-upload.sh#L122-L138) builds its own manifest; [remote check and pruning path](../../infra/poly-collector/poly-collector-upload.sh#L168-L212) verifies remote size before publishing and marks batches eligible for pruning. Equal sizes do not prove hash parity or replay equivalence. The dry-run branches also return success before the shared marker and pruning path; do not run the uploader on shared or real data, even in dry-run mode. Require a separately authorized isolated test to show no marker or deletion on disk-ceiling and retention paths.

## Steps and verification matrix
- [ ] Trace runtime/output paths, closed-segment handoff, Parquet cadence, manifest format, time sync, credentials, retries and shutdown. Record which Rust or TS path is proposed and why, which pieces remain incompatible or unverified, and which must pass offline integration first. No schema or consumer changes are authorized.
- [ ] Specify unit checks for frame corruption/truncation, UTC boundary and continuity, hash mismatch, stale or missing segment, capacity thresholds and stop behavior. Specify local integration checks for complete batch handoff, manifest verify and clean restore/replay; test interrupted uploads, restart, disk pressure, tampering and recovery. A synthetic test is future work under separate approval, disconnected from venue/cloud and with no genuine forecasts or uploads.
- [ ] Define end-to-end desk acceptance: expected vs actual paths, no unsafe credential inheritance, all missing/changed objects detectably fail, restored replay hashes match, and no orphan process or automatic deletion before independent restore proof. Record PASS only for what was actually exercised; untested integration remains HOLD.

**Risk and fallback:** medium × high for incompatible archive formats or irreversible pruning. Future runbook must stop only owned processes, preserve evidence per license, quarantine uncertain batches and disable uploads/retention automation until independently verified. This phase does not alter existing users, data or integrations.

## Tóm tắt tiếng Việt / Vietnamese handoff

Kế hoạch G8.2 này chỉ mô tả kiểm chứng tương lai; kết quả TEST_ONLY lịch sử không chứng minh hệ thống thật. Phải chọn rõ Rust hoặc TypeScript, kiểm tra đóng batch, hash, upload, tải lại, replay, dừng và khởi động lại. Không coi kiểm tra size là kiểm tra nội dung. G8.3 là công việc sửa lỗi riêng, chưa có kết luận hoàn tất ở hồ sơ này.
