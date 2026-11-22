# POLY-G8.6 Track C — Vietnam Legal G12 Review & Bounded Counsel Request

**Date:** 2026-11-22  
**Status:** `LEGAL_G12 = HOLD` (`QUOTE_REQUEST_READY` — unsent, zero paid engagement)  
**Canonical Dossier (Preserved, Not Rewritten):** [`docs/poly-g8/02-VIETNAM-LEGAL-G12-COUNSEL-BRIEF.md`](../poly-g8/02-VIETNAM-LEGAL-G12-COUNSEL-BRIEF.md)

---

## C1. Statutory Source Verification Delta (2026-11-22)

Live verification against official Vietnamese government publications was performed on `2026-11-22`. AI analysis does **not** substitute for licensed Vietnamese counsel.

### Verified Live from Official Government Portals
1. **Luật Công nghiệp công nghệ số số `71/2025/QH15`**
   - Source: Bộ Khoa học và Công nghệ (`https://mst.gov.vn/van-ban-phap-luat/25224.htm`)
   - Enacted: `14/06/2025` | Effective: `01/01/2026` | Status: `Văn bản còn hiệu lực` (signed PDF linked).
   - **Legal uncertainty:** Statutory recognition of digital assets (`tài sản số`, Điều 46–48) does **not** authorize offshore prediction-market contracts or betting.
2. **Nghị quyết số `05/2025/NQ-CP`** (Thí điểm thị trường tài sản mã hóa tại Việt Nam)
   - Source: Cổng Thông tin điện tử Chính phủ (`https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-so-5-2025-nq-cp-ve-trien-khai-thi-diem-thi-truong-tai-san-ma-hoa-tai-viet-nam-119250909184045221.htm`)
   - Enacted & Effective: `09/09/2025` (5-year pilot).
   - Verified text: Điều 7 (Khoản 1–3) mandates domestic crypto-asset trading through MOF-licensed providers, with a 6-month enforcement clock triggered after the first MOF license; Điều 17 caps pilot providers at 5.
   - **Legal uncertainty:** Whether the Ministry of Finance (Bộ Tài chính) has issued the first pilot license as of `2026-11-22`, and whether offshore binary event contracts fall under `tài sản mã hóa`, remain **UNVERIFIED / UNSETTLED** and require licensed counsel verification.

### Unverified Live — Mandatory Counsel Verification List
The following statutes could not be verified live from official portals (e.g., secondary portals returned HTTP 403 or consolidated texts were not retrieved) and are flagged as **UNVERIFIED** for licensed counsel:
- **Bộ luật Hình sự `100/2015/QH13`** (sửa đổi `12/2017/QH14`), Điều 321–322 (đánh bạc / tổ chức đánh bạc).
- **Nghị định `06/2017/NĐ-CP`** (kinh doanh đặt cược đua ngựa, đua chó, bóng đá quốc tế) và bất kỳ văn bản sửa đổi có hiệu lực nào (lưu ý: dự thảo 2025 không phải luật đã ban hành).
- **Nghị định `144/2021/NĐ-CP`** (xử phạt vi phạm hành chính).
- **Luật Bảo vệ dữ liệu cá nhân `91/2025/QH15`** và **Nghị định `13/2023/NĐ-CP`** (trách nhiệm xử lý dữ liệu cá nhân, chuyển dữ liệu ra nước ngoài).
- **Luật Chứng khoán `54/2019/QH14`** (sửa đổi `56/2024/QH15`).
- **Luật An ninh mạng `24/2018/QH14`** / **Nghị định `53/2022/NĐ-CP`** và **Nghị định `52/2013/NĐ-CP`** (sửa đổi `85/2021/NĐ-CP` về thương mại điện tử).

### Unanswered Legal Questions Carried to Counsel
All 12 required areas remain open pending written legal opinion: (1) personal research vs. (2) proprietary quant research, (3) prediction-market data usage, (4) digital/crypto-asset regulations, (5) automated event-contract trading, (6) public paper-trading SaaS, (7) financial advice vs. simulation tools, (8) marketing to Vietnamese users, (9) data privacy, (10) cross-border cloud processing (VPS/R2/Cloudflare), (11) customer deposits and custody (strictly out of scope, confirm zero-custody boundary), and (12) service-provider vs. operator classification.

---

## C2. Compact Vietnamese Counsel Quote Request (UNSENT)

> **Governance:** Do **not** hire counsel or accept a quotation without separate Founder approval. Submit private operator/entity facts separately under attorney-client privilege.

```text
Tiêu đề: Đề nghị báo giá trọn gói (Fixed-Fee) — Ý kiến pháp lý sơ bộ (G12) cho dự án nghiên cứu định lượng và phần mềm mô phỏng Paper Trading SaaS tại Việt Nam

Kính gửi [Tên Luật sư / Công ty Luật độc lập],

Tôi là [Họ tên Founder — điền trước khi gửi], hiện cư trú và vận hành dự án phần mềm từ Việt Nam (tư cách cá nhân / doanh nghiệp dự kiến sẽ cung cấp chi tiết riêng khi ký NDA/Engagement). Tôi kính đề nghị Quý Văn phòng gửi báo giá trọn gói (fixed-fee) cho một Ý kiến pháp lý sơ bộ bằng văn bản (Written Preliminary Legal Opinion) đánh giá các ranh giới pháp lý sau tại Việt Nam:

1. Phạm vi hoạt động cần tách bạch rõ trong ý kiến pháp lý:
   - Nhóm 1 (Chỉ nghiên cứu dữ liệu — đang KHÓA chờ giấy phép dữ liệu): Thu thập tự động dữ liệu sổ lệnh thị trường dự đoán (Polymarket) cho tối đa 150 thị trường, lưu trữ 30 ngày (WAL/Parquet) trên VPS Linux cô lập và Cloudflare R2 riêng để backtest nội bộ và đánh giá xác suất. Không giao dịch tiền thật, không ký ví, không phân phối lại dữ liệu thô.
   - Nhóm 2 (Phần mềm Paper Trading SaaS cô lập — đang KHÓA chờ duyệt): Cung cấp công cụ mô phỏng giao dịch bằng $100 vốn ảo ($0 tiền thật), không nhận nạp/rút tiền, không lưu ký tài sản, không chia lợi nhuận, không thực thi lệnh thật.
   - Nhóm 3 (Ngoài phạm vi hiện tại — ĐANG TẮT): Giao dịch tự doanh bằng tiền thật trên hợp đồng sự kiện / tài sản mã hóa, tư vấn đầu tư, hoặc quản lý vốn cho bên thứ ba.

2. Yêu cầu đầu ra cụ thể của Ý kiến sơ bộ bằng văn bản:
   (a) Xác định thẩm quyền tài phán và phân loại hoạt động kinh doanh cho từng Nhóm 1, 2, 3 (so sánh cá nhân cư trú tại Việt Nam vs. pháp nhân đăng ký tại Việt Nam; phân biệt nhà cung cấp công cụ mô phỏng vs. nhà vận hành dịch vụ tài chính/đặt cược/tư vấn đầu tư).
   (b) Ranh giới tuân thủ bắt buộc cho Nhóm 1 (nghiên cứu chỉ dùng dữ liệu): tương tác giữa giấy phép dữ liệu Polymarket/ICE với pháp luật Việt Nam, xử lý/lưu trữ đám mây xuyên biên giới (VPS/R2), và quy định về dữ liệu cá nhân (Luật 91/2025/QH15, Nghị định 13/2023/NĐ-CP nếu còn hiệu lực).
   (c) Ranh giới tuân thủ bắt buộc cho Nhóm 2 (Paper SaaS): điều kiện để không bị xếp loại là tổ chức đánh bạc/đặt cược (BLHS Điều 321–322, Nghị định 06/2017/NĐ-CP), dịch vụ chứng khoán/tài sản mã hóa (Luật 71/2025/QH15, Nghị quyết 05/2025/NQ-CP và tình trạng cấp phép đầu tiên của Bộ Tài chính), quy định tiếp thị tới người dùng Việt Nam, bảo vệ người tiêu dùng, và yêu cầu công bố thông tin (disclosures).
   (d) Điều kiện tách biệt tuyệt đối cho Nhóm 3 (tiền thật) — xác nhận rõ ý kiến cho phép Nhóm 1 hoặc 2 KHÔNG đồng nghĩa cho phép giao dịch tiền thật.
   (e) Danh mục hồ sơ, đăng ký kinh doanh, thông báo/đánh giá tác động chuyển dữ liệu hoặc giấy phép cần hoàn tất trước khi kích hoạt từng nhóm.

3. Đề nghị báo giá:
   Xin Quý Văn phòng vui lòng cung cấp: (i) mức phí trọn gói cố định (fixed-fee), (ii) thời gian hoàn thành dự kiến, (iii) phạm vi rà soát văn bản pháp luật hợp nhất hiện hành, và (iv) xác nhận không xung đột lợi ích. Thư này chỉ nhằm yêu cầu báo giá, chưa phát sinh nghĩa vụ thuê dịch vụ hay thanh toán.

Trân trọng,
[Họ tên Founder — điền trước khi gửi]
[Thông tin liên hệ — điền trước khi gửi]
```

---

## C3. G12 Decision

`LEGAL_G12 = HOLD`. A future research-only opinion shall **never** authorize live trading (`REAL_MONEY_TRADING = DISABLED`).
