---
phase: 3
title: "Cost and capacity"
status: pending
priority: P2
effort: 2h
dependencies: [1, 2]
---

> **Bản công khai / Public copy — 2026-11-19:** Hồ sơ G8.2 tại baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`; phát hiện và kết quả TEST_ONLY bên dưới là lịch sử, không phải kết luận sau sửa G8.3. Các nguồn pháp luật là đầu mối cần luật sư xác nhận, không phải ý kiến pháp lý. Mọi gate A–F vẫn HOLD. / Historical baseline findings and TEST_ONLY results, not post-remediation assurances; legal sources require counsel validation. No activation is authorized.


## Goal / Mục tiêu
Assess the $30/month infrastructure ceiling for 150 markets and rolling 30-day WAL and Parquet retention, without purchasing or running anything.

## Inputs and ownership
- Read only: [existing costed plan](../../docs/poly-g8/03-VPS-R2-COSTED-DEPLOYMENT-PLAN.md), lines 5–52. This phase owns rates, capacity and estimates; Phase 04 owns integration verification.
- [DigitalOcean](https://www.digitalocean.com/pricing/droplets) rechecked 2026-11-19: $24/month Basic, 2 vCPU, 4 GiB RAM, 80 GiB SSD, 4,000 GiB transfer. Confirm SKU mapping, region eligibility and availability, taxes, overage rates and deletion/renewal rules separately. No verified Hetzner substitute.
- [R2 Standard pricing](https://developers.cloudflare.com/r2/pricing/) (metadata 2026-10-30), rechecked 2026-11-19: $0.015/GB-month, $4.50/million Class A, $0.36/million Class B, no direct egress fee (connected services may charge). Published allowances: 10 GB-month, 1M A, 10M B; don't assume headroom. Billing examples round to whole GB-month and million-operation units.
- [PR #281](https://github.com/minhlongs/algo-trader/pull/281) reports a bounded 30s drill with 2,398 valid frames, not the bytes/duration/market breakdown for 4.39 MB/market-hour. Do not substitute the separate [G7.1 report](../../docs/poly-g7/03-L2-DATA-CAPTURE-AND-REPLAY-REPORT.md), lines 83–91 (636 frames, four tokens). The [CLI](../../scripts/poly-l2-collector.ts#L85-L91) approximates market count with rounded tokens/2; the [model](../../src/desk/polymarket/l2/l2-collector-cost-model.ts#L88-L106) normalizes by market-hours and prices modeled compressed storage, not measured WAL plus Parquet.

## Steps and exit criteria
- [ ] Recover exact bytes, elapsed time, token-to-market map and initial-snapshot treatment from existing artifacts, or mark 4.39 as unverified. At that input, `4.39 × 150 × 720 / 1000 = 474.12 GB` raw WAL; no p95 claim. Report WAL and Parquet independently, with compression assumptions labeled.
- [ ] Reconcile low/base/stress, operation and storage rounding, retention overlap, multipart/retries, restore, monitoring/backups, tax/overages. The earlier $0.0226 operation estimate was prorated, not a no-free-tier invoice; the current cost document has already corrected it. One billable block each of A/B adds $4.86. With storage rounded to 80/271/1,897 GB-month and the draft’s reserves, the **$31.06 / $33.93 / $59.32** no-allowance scenarios in its English decision section reconcile before tax and overage. The superseded $29.09 base estimate is not Gate D evidence. Show confirmed-allowance and no-allowance cases separately. Do not call a stress case the maximum invoice. Track license, counsel and genuine inference separately; no assumed free services or paid calls.
- [ ] Validate units and lifecycle assumptions; budget the 48h spool plus staging, logs and headroom; include bandwidth/CPU/memory and safe-stop signals. Alerts are not hard caps. Define later field measurements separately from the pre-provision estimate; never require spending to authorize itself.

**Risk and fallback:** high × high for underestimated bills or disk exhaustion. Gate D stays `HOLD` on missing evidence or projections over cap. Do not resize scope to force PASS; remove unsupported assumptions and escalate trade-offs to the owner.

## Tóm tắt tiếng Việt / Vietnamese handoff

Giữ nguyên 150 thị trường và 30 ngày WAL/Parquet. Giả định 4,39 MB/thị trường-giờ chưa có phép đo tái lập. Ba dự toán không trừ miễn phí là 31,06 / 33,93 / 59,32 USD trước thuế và giấy phép, không phải trần hóa đơn. Cần đủ VPS, lưu trữ, request, backup, băng thông và thuế; thiếu giá hoặc vượt 30 USD thì Gate D HOLD. Không cấp phát để tự tạo điều kiện phê duyệt.
