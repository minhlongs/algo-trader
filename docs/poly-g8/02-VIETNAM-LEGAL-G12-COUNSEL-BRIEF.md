# G8.2 — Hồ sơ đề nghị luật sư độc lập đánh giá G12

> **Bản công khai / Public copy — 2026-11-19:** Hồ sơ G8.2 tại baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`; phát hiện và kết quả TEST_ONLY bên dưới là lịch sử, không phải kết luận sau sửa G8.3. Các nguồn pháp luật là đầu mối cần luật sư xác nhận, không phải ý kiến pháp lý. Mọi gate A–F vẫn HOLD. / Historical baseline findings and TEST_ONLY results, not post-remediation assurances; legal sources require counsel validation. No activation is authorized.


Ngày: 2026-11-19. Trạng thái: PREPARED FOR REVIEW; không phải tư vấn pháp lý, chưa thuê/gửi hồ sơ cho luật sư. `LEGAL_G12=HOLD`.

## Sự kiện và luồng dữ liệu

Dự án phần mềm định lượng do operator tại Việt Nam dự kiến vận hành. Tư cách cá nhân/pháp nhân, nơi cư trú, khách hàng mục tiêu và cơ cấu doanh thu cần Founder cung cấp riêng cho counsel. Kho mã dự án / project repository, baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`.

Luồng đề xuất, CHƯA KÍCH HOẠT: public market API/WebSocket → VPS Linux cô lập → WAL/Parquet → private R2 → backtest và prospective evaluation. Không order signer, customer deposits/custody/profit sharing. Paper Beta đang là sản phẩm riêng; G8.2 không thay đổi hoặc tái cấp phép sản phẩm đó. Dữ liệu người dùng SaaS không được đưa vào collector.

## Ma trận hoạt động cần counsel trả lời riêng

| Nhóm | Hoạt động | Vấn đề/rủi ro cần kết luận | Ranh giới hiện tại |
|---|---|---|---|
| A | Ingestion dữ liệu công khai | Hợp đồng dữ liệu, automated access, quyền sở hữu và cloud processor | HOLD cho đến quyền dữ liệu và legal basis |
| B | Offline backtest | Tính hợp pháp nguồn archive, quyền chuyển đổi/lưu, model training | Chỉ synthetic hoặc dữ liệu có quyền sử dụng rõ ràng |
| C | Public Paper Trading SaaS | Phân loại mô phỏng so với betting/investment advice, quảng cáo, consumer protection, dữ liệu cá nhân | Không tiền thật; không kết luận tự động rằng paper là miễn luật |
| D | Tự doanh vốn thật | Prediction contracts, gambling, crypto pilot, ngoại hối/thuế, venue eligibility | DISABLED |
| E | Quản lý vốn/tư vấn đầu tư cho người khác | Giấy phép dịch vụ, securities/crypto classification, trách nhiệm tư vấn | Ngoài phạm vi; không triển khai |
| F | Nhận tiền, custody, execution, chia lợi nhuận | Licensing, AML/KYC, payment/custody, trách nhiệm hình sự | Ngoài phạm vi; không triển khai |

## Nguồn pháp luật và trạng thái kiểm chứng

1. [Bộ KH&CN: Luật 71/2025/QH15](https://mst.gov.vn/van-ban-phap-luat/25224.htm), ban hành 14-06-2025, hiệu lực chung 01-01-2026. Điều 46–48 về tài sản số/phân loại/quản lý. [Bản hợp nhất trên Công báo](https://congbao.cdnchinhphu.vn/180507251028987904/2026/3/5/468973-1772691656_v1_1772691967_signed.pdf) được search trả về có sửa đổi năm 2026; counsel phải kiểm tra bản ký và tình trạng hiệu lực. Công nhận tài sản số không tự cho phép prediction-market betting.
2. [Toàn văn Nghị quyết 05/2025/NQ-CP trên Cổng Chính phủ](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-so-5-2025-nq-cp-ve-trien-khai-thi-diem-thi-truong-tai-san-ma-hoa-tai-viet-nam-119250909184045221.htm), ban hành/hiệu lực 09-09-2025, thí điểm 5 năm. Đã đối chiếu toàn văn: khoản 2 Điều 7 đặt mốc xử lý giao dịch ngoài tổ chức được cấp phép đối với nhà đầu tư trong nước sau 6 tháng từ giấy phép đầu tiên; khoản 3 quy định giao dịch tài sản mã hóa qua tổ chức được Bộ Tài chính cấp phép. **Chưa xác minh ngày cấp phép đầu tiên, sửa đổi mới hoặc việc áp dụng cho hợp đồng Polymarket**. Không dùng văn bản này như giấy phép giao dịch offshore.
3. Nghị định 06/2017/NĐ-CP, ngày 24-01-2017, hiệu lực 31-03-2017: phạm vi đua ngựa/đua chó/bóng đá quốc tế, được tìm thấy qua [bản dịch thứ cấp](https://thuvienphapluat.vn/van-ban/EN/Doanh-nghiep/Decree-06-2017-ND-CP-businessf-betting-on-horse-racing-greyhound-racing-and-international-soccer/340208/tieng-anh.aspx). Bản dự thảo sửa đổi năm 2025 xuất hiện trong tìm kiếm **không phải luật đã ban hành**. Counsel cần xác minh văn bản hiện hành trước khi viện dẫn giới hạn Internet.
4. Các nguồn cần counsel bổ sung bản chính thức/hợp nhất: Bộ luật Hình sự (đánh bạc/tổ chức đánh bạc, Điều 321–322); Luật Chứng khoán 54/2019/QH14 và sửa đổi; Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và văn bản hướng dẫn; pháp luật an ninh mạng, quảng cáo, bảo vệ quyền lợi người tiêu dùng, thương mại điện tử, thanh toán/ngoại hối, AML và thuế. Truy xuất ban đầu không trả về văn bản đủ dùng; **chưa xác minh điều khoản/ngày hiệu lực hiện hành cho các nguồn này**. Không viện dẫn URL đoán sai.

## Câu hỏi yêu cầu kết luận bằng văn bản

- Với từng A–F, cá nhân cư trú Việt Nam và công ty đăng ký Việt Nam khác nhau thế nào? Đăng ký kinh doanh nào cần thiết nhưng chưa đủ?
- Binary event contracts, collateral token và payout có phân loại khác nhau không? Cấu trúc nào thuộc betting, securities, tài sản mã hóa hoặc dịch vụ tài chính?
- Điều 7 Nghị quyết 05 áp dụng ra sao, mốc giấy phép đầu tiên là ngày nào, có thay đổi đến ngày ký ý kiến không?
- A/B có thể thực hiện với license dữ liệu riêng mà không sử dụng tính năng trading không? VPS ngoài Việt Nam có phát sinh yêu cầu xuyên biên giới nào? Không được chọn region để né luật.
- C có cần disclosure, age gate, điều kiện quảng cáo, khiếu nại/hoàn tiền hoặc giới hạn câu chữ performance không? Không quảng bá lợi nhuận được bảo đảm.
- Market data có chứa địa chỉ ví/định danh cá nhân không? Account/email/IP/log SaaS có cần consent, assessment chuyển dữ liệu, processor agreement, retention/deletion hay breach reporting nào?
- Có cần giấy phép/quy định về AI đối với dự báo và analytics? Điều khoản Terms Polymarket nào cần permission bổ sung?
- Trường hợp không thể hợp pháp hóa D–F, ranh giới A–C nào được phép và cách kiểm chứng kỹ thuật là gì?

## Điều kiện G12 signoff

Ý kiến của người hành nghề độc lập đủ năng lực, ghi ngày, pháp nhân/operator, phạm vi A–F, bộ nguồn hiện hành, giả định và ngoại lệ; quyền dữ liệu đã xác nhận; giấy phép/filing/consent cần thiết đã hoàn tất; giới hạn địa lý và marketing rõ ràng; thời hạn tái đánh giá và trigger thay đổi sản phẩm. Không cần công khai privileged advice trên GitHub: chỉ công bố gate status và mã tham chiếu không nhạy cảm.

AI research không thay thế legal clearance. Hồ sơ còn cần counsel xác minh nguồn và Founder cung cấp facts riêng; không được coi tài liệu này là gói ý kiến pháp lý hoàn tất.

## English — Independent counsel handoff

**Prepared for review; not sent or commissioned; G12 stays HOLD.** The proposed operator is in Vietnam. Confirm the legal entity, residence, target customers and revenue model privately. The inactive proposal is public market API/WebSocket → isolated Linux VPS → WAL/Parquet → private R2 → backtest and prospective evaluation. No signing, deposits, custody, or profit-sharing. The existing Paper Beta is separate and unchanged; its user data must not enter the collector.

| Activity | Question for counsel | Current boundary |
|---|---|---|
| A — Data ingestion | Automated access, contractual and cloud processing rights | HOLD pending rights and legal basis |
| B — Offline backtest | Lawful source, archival, transformation and model-use rights | Synthetic or clearly authorized data only |
| C — Paper SaaS | Simulation vs. betting/advice; advertising, consumer and privacy duties | No actual funds; no blanket exemption |
| D — Proprietary trading | Prediction contracts, crypto pilot, tax/FX and venue eligibility | Disabled |
| E — Third-party advice or capital management | Financial/crypto service licensing | Out of scope |
| F — Deposits, custody, execution or profit share | Licensing, AML/KYC and liability | Out of scope |

Review the official Law 71/2025/QH15 (general effective date January 1, 2026; Articles 46–48) and Resolution 05/2025/NQ-CP (September 9, 2025; Article 7 and first-license trigger), linked above. Neither establishes permission for offshore event contracts. Verify the consolidated law, amendments, first-license date and applicability. Decree 06/2017/NĐ-CP was found in secondary translation only. Counsel must confirm current Penal Code Articles 321–322 and financial, consumer, advertising, privacy, cross-border, AML, FX, tax and AI rules. Compare individual and registered entity requirements; assess contract/token/payout categories separately; specify whether A/B can proceed without trading, what disclosures apply to C, and whether wallet/address and SaaS data create privacy obligations. Do not select a region to avoid applicable rules.

Signoff requires dated, documented independent advice naming the operator, scope and restrictions, confirmed data rights and any required licenses, filings or consent, plus triggers for re-review. Share only status and a non-sensitive reference publicly, not privileged advice.
