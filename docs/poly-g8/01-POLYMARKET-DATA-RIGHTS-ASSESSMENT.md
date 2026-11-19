# G8.2 — Đánh giá quyền sử dụng dữ liệu

> **Bản công khai / Public copy — 2026-11-19:** Hồ sơ G8.2 tại baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`; phát hiện và kết quả TEST_ONLY bên dưới là lịch sử, không phải kết luận sau sửa G8.3. Các nguồn pháp luật là đầu mối cần luật sư xác nhận, không phải ý kiến pháp lý. Mọi gate A–F vẫn HOLD. / Historical baseline findings and TEST_ONLY results, not post-remediation assurances; legal sources require counsel validation. No activation is authorized.


Ngày đánh giá: 2026-11-19. Baseline: `7319b8d04305d14c95cd366a1593d3bdfa9235ec`. Đây là nghiên cứu chuẩn bị, không phải ý kiến pháp lý hay giấy phép sử dụng dữ liệu.

## Nguồn và giới hạn chứng cứ

- [Terms of Use](https://polymarket.com/tos): nội dung được công cụ đọc trang trả về ghi hiệu lực **11-08-2026**, §4.2 về truy cập và thu thập dữ liệu; phần mở đầu và §4.1 về giới hạn địa lý. Lần đọc đầu có cảnh báo không tự xác minh live; lần đọc tiếp theo trả về các điều khoản dưới đây. Chưa lưu bản Terms có chữ ký/hash; counsel phải đối chiếu bản hiện hành trước quyết định.
- [Geographic restrictions](https://help.polymarket.com/en/articles/13364163-geographic-restrictions): công cụ đọc trang báo cập nhật 29-10-2026, không nêu ngày hiệu lực riêng. Vietnam không xuất hiện trong danh sách trả về. Điều đó **không** xác nhận quyền sử dụng, kinh doanh hay giao dịch tại Việt Nam.

Không dùng kết quả WebSearch thất bại hoặc URL văn bản pháp luật bị đoán sai làm chứng cứ.

## Ma trận phân loại

Các quyết định dưới đây áp dụng cho dự án nghiên cứu định lượng/phát triển phần mềm thương mại dự kiến, không suy rộng sang mọi người dùng.

| Hoạt động | Kết luận vận hành | Căn cứ |
|---|---|---|
| Truy cập dữ liệu với tư cách prop firm/fintech | REQUIRES_WRITTEN_PERMISSION | Terms hiệu lực 11-08-2026, §4.2: định nghĩa Capital Market Client bao gồm proprietary trading firms và financial technology companies; truy cập dữ liệu cần thỏa thuận bằng văn bản |
| Xác định cá nhân/operator có thuộc định nghĩa này hay không | REQUIRES_COUNSEL | Cùng §4.2; chưa có hồ sơ pháp nhân và kết luận phân loại. Không dùng tài khoản cá nhân để né phân loại |
| API/WebSocket tự động, universe 150 markets | REQUIRES_WRITTEN_PERMISSION | §4.2 bao phủ “directly or through an API, or any other means, including on-chain”; không thấy ngoại lệ riêng cho WebSocket |
| Scraping hoặc thu thập không được cho phép | PROHIBITED | §4.2 cấm robots/crawlers/data extraction và unauthorized collection; không áp dụng cách gọi “public API” để tự miễn trừ |
| Nghiên cứu nội bộ không phân phối | REQUIRES_WRITTEN_PERMISSION | §4.2 không đưa ngoại lệ nghiên cứu nội bộ cho Capital Market Client |
| Lưu WAL/Parquet 30 ngày, backtest | UNKNOWN | Terms 11-08-2026 không nêu thời hạn lưu riêng trong nội dung đã đọc; cần quyền truy cập và phạm vi lưu được xác nhận |
| Dữ liệu phái sinh/aggregated/anonymized | REQUIRES_WRITTEN_PERMISSION | §4.2 nêu rõ các dạng này trong phạm vi hạn chế |
| Bán/chia sẻ dữ liệu cho Capital Market Client hoặc distributor | REQUIRES_WRITTEN_PERMISSION | §4.2, hạn chế resale/redistribution/commercial exploitation |
| Công bố hoặc chia sẻ riêng với bên khác ngoài phạm vi trên | UNKNOWN | Không có blanket license; yêu cầu xác nhận người nhận và output cụ thể |
| VPS và private R2 làm processor | UNKNOWN | Nội dung đã đọc không cấp quyền riêng cho cloud processing; cần ghi rõ vendor, vùng, access và deletion trong văn bản cho phép |
| Dùng VPS/VPN để vượt hạn chế operator | PROHIBITED | Terms phần mở đầu và §4.1 hiệu lực 11-08-2026 và geographic page cập nhật 29-10-2026 |
| Tư cách hợp pháp tại Việt Nam | REQUIRES_COUNSEL | Terms §4.1 yêu cầu tuân thủ luật áp dụng; danh sách địa lý không thay thế pháp luật địa phương |

Phạm vi hạn chế thương mại được đọc không đồng nghĩa cấm mọi hình thức thương mại cho mọi đối tượng. Chưa xác nhận một chương trình Builder hay quyền truy cập on-chain áp dụng cho dự án. Không có hoạt động thu thập dự kiến nào được nâng lên `CONFIRMED_PERMITTED` chỉ vì endpoint truy cập công khai. Kết luận: `DATA_LICENSE=PERMISSION_PENDING`; tiếp tục khóa external collection.

## Thư hoàn chỉnh chờ Founder gửi / Final Founder-send draft

`DATA_RIGHTS_OUTREACH=READY_FOR_FOUNDER_SEND`; `DATA_LICENSE=PERMISSION_PENDING`.

**Chưa gửi / UNSENT.** Không có danh tính pháp lý hoặc tài khoản gửi được xác minh; không dùng GitHub identity làm bằng chứng thẩm quyền. Founder điền thông tin đúng thực tế và gửi **một thư duy nhất** đến hai địa chỉ bên dưới; không có tệp đính kèm. Không ký hợp đồng, nhận gói trả phí hoặc đồng ý điều khoản bằng thư này. / No verified legal sender identity or authorized sending account is available. Founder must complete the truthful identity fields before dispatching this single inquiry; no attachments or acceptance of terms.

Địa chỉ được đối chiếu lại ngày 2026-11-19 trên [Polymarket Institutional](https://institutional.polymarket.com/). / Recipients rechecked against the official page on 2026-11-19.

**To:** data-licensing@polymarket.com

**Cc:** sales-icedataservices-usinsidesales@theice.com
**Subject:** Written data-use authorization inquiry — Vietnam research pilot, up to 150 markets, 30-day L2 archive

Dear Polymarket Data Licensing and ICE Data Services teams,

I am [actual sender name], writing as [truthful individual/business status and, only if applicable, legal entity and authorized role]. I operate from Vietnam and am preparing a limited private quantitative research project. Please advise on the permissions required for the scope below before any continuous collection is activated.

The proposed research would observe public API/WebSocket L2 order books for up to 150 markets, including point-in-time snapshots, deltas and trades where authorized. We propose thirty-day rolling WAL/Parquet retention on an isolated private Linux VPS and private Cloudflare R2 storage, for backtesting and prospective market-blind probability evaluation (forecasts committed before consulting market prices). Providers and regions would be selected only within the authorized geographic and security conditions; we will not circumvent restrictions.

The immediate phase is research only. Potential future commercial software use is contemplated but is not assumed to be licensed. There will be no data resale or redistribution without separate authorization, and no trading, custody or customer deposits in the current research phase. We do not assume public access, derived outputs or internal research creates an exemption.

Please confirm in writing:

A. **Classification:** Does the actual operator and proposed activity fall within the Capital Market Client definition? What identity/entity information is needed to determine this?

B. **Required permission:** Is Polymarket written permission, a separate ICE agreement, or both required for this exact scope?

C. **Feeds and archives:** Which API/WebSocket feeds, snapshots, deltas and trades may be captured, transformed into WAL/Parquet and retained for thirty days for these backtesting and evaluation purposes? Please specify backup and deletion conditions.

D. **Outputs:** Are private derived analytics, proprietary research models and potential future commercial software outputs permitted? What additional consent would be needed for private reports, public aggregate findings or other outputs? We will not assume raw, derived, aggregated or anonymized data may be redistributed.

E. **Restrictions:** What market-count, polling/subscription-rate, retention, security, cloud-processor and geographic restrictions apply to a Vietnam-operated project and its VPS/R2 locations?

F. **Cost:** Can this limited research pilot be licensed at no cost, or is a paid license required? Please provide applicable pricing, term and revocation conditions for review only; this inquiry does not authorize a purchase or accept any financial obligation.

G. **Authority and process:** Which legal entity is authorized to grant the necessary permission, and what contracting or approval process and documentation are required?

H. **Research exception:** Is a non-commercial evaluation license or research-only exception available, and what conditions and expiry would apply?

Continuous collection will remain disabled pending appropriate written clearance, independent local legal review and separate operational approval. This message requests information and authorization terms only; it does not accept an agreement or represent that permission already exists.

Regards,
[Actual sender name — Founder completes before sending]
[Truthful individual/business status; entity and role only if applicable]


## Hồ sơ cần lưu trước Gate A

Bản Terms hiện hành và ngày truy cập; phân loại operator/pháp nhân; quyền bằng văn bản đúng hoạt động và vùng; thời hạn/license fee; quyền lưu/xử lý/chia sẻ; quy trình khi thu hồi. Chưa gửi thư, chưa có giấy phép, chưa có clearance.

## English — Decision and evidence to retain

**Written permission required; external collection remains off.** The returned [Terms](https://polymarket.com/tos) text (effective August 11, 2026, subject to recheck) describes proprietary trading firms and fintechs as Capital Market Clients and restricts their data access, including through APIs or other means, unless covered by a written agreement. No internal-research or WebSocket exemption was identified. This assessment treats automated collection and commercial use of derived, aggregated or anonymized data within that restriction as requiring written permission. Unauthorized collection and location circumvention are prohibited. The operator's legal/entity classification and Vietnam eligibility require counsel. Retention, cloud processing, and sharing beyond specifically addressed categories are unknown without express terms; public endpoints are not a license. Vietnam not appearing in the returned [October 29 geographic guidance](https://help.polymarket.com/en/articles/13364163-geographic-restrictions) does not establish eligibility. The returned text was not independently archived and is not legal clearance.

Before Gate A can pass, retain the current Terms and access date, operator classification, signed authorization covering the actual workflow and locations, any data-sharing and deletion terms, fees, term and revocation instructions. The English inquiry above is a draft only; it has not been sent.

### Tóm tắt thư xin phép / Vietnamese inquiry summary

Kính đề nghị Polymarket xác nhận phân loại operator và cấp quyền bằng văn bản cho nghiên cứu định lượng nội bộ tại Việt Nam, thu tự động L2 tối đa 150 thị trường, lưu WAL/Parquet 30 ngày trên VPS cô lập và R2 riêng, kiểm thử lịch sử và đánh giá dự báo. Xin xác nhận API/WebSocket, hạn mức, khu vực, quyền phát triển phần mềm thương mại, kết quả phái sinh và giới hạn công bố/chia sẻ, quyền đối với nhà cung cấp lưu trữ, thời hạn, chi phí và quy trình thu hồi/xóa. Không giao dịch, không giữ tiền khách và không phân phối dữ liệu thô. Phạm vi gửi một thư đã được cho phép; chỉ Founder gửi sau khi điền đúng danh tính và xác minh tài khoản gửi. Chưa có thư nào được gửi.

**A–H bằng tiếng Việt:** A phân loại operator; B văn bản Polymarket/ICE cần có; C feed và quyền lưu archive; D mô hình/kết quả phái sinh và phần mềm thương mại; E giới hạn số thị trường, tốc độ, lưu giữ, bảo mật, cloud và địa lý; F miễn phí hay trả phí (chỉ xin báo giá); G bên cấp quyền và quy trình hợp đồng; H ngoại lệ hoặc giấy phép nghiên cứu phi thương mại. Không chấp nhận nghĩa vụ bằng thư này.
