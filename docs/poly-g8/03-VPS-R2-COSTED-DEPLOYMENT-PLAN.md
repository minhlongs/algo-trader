# G8.2 — Kế hoạch VPS/R2 và ngân sách

> **Bản công khai / Public copy — 2026-11-19:** Hồ sơ G8.2 tại baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`; phát hiện và kết quả TEST_ONLY bên dưới là lịch sử, không phải kết luận sau sửa G8.3. Các nguồn pháp luật là đầu mối cần luật sư xác nhận, không phải ý kiến pháp lý. Mọi gate A–F vẫn HOLD. / Historical baseline findings and TEST_ONLY results, not post-remediation assurances; legal sources require counsel validation. No activation is authorized.


Ngày 2026-11-19. Chỉ chuẩn bị; không mua, không provision, không chạy collector. `INFRA_PREFLIGHT=HOLD`, `VPS_R2_PROVISIONING=NOT_AUTHORIZED`.

## SKU và nguồn giá

[DigitalOcean Basic Droplets](https://www.digitalocean.com/pricing/droplets): công cụ đọc trang trả về SKU `s-2vcpu-4gb`, 2 vCPU, 4 GiB RAM, 80 GiB SSD, $24/tháng, 4,000 GiB outbound transfer; giá $0.03571/giờ, tính theo giây (tối thiểu 60 giây hoặc $0.01), trần niêm yết $24/tháng; thuế tùy nơi thanh toán. Trang không có ngày cập nhật riêng. Phải xác nhận lại console/checkout, region availability, overage và terms trước Gate D. Không có promotional renewal discount được giả định; dự toán theo giá niêm yết hàng tháng, không cam kết trả trước. Không coi shutdown VM là chấm dứt hóa đơn; xác minh chính sách billing/deletion trước mua.

[Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/): Standard $0.015/GB-month, Class A $4.50/million, Class B $0.36/million, direct egress miễn phí. Allowance 10 GB-month/1M A/10M B dùng chung account có thể đã tiêu thụ; dự toán dưới đây **không trừ free tier**. Công cụ đọc báo trang cập nhật 30-10-2026. Usage rounding và các dịch vụ kết nối có thể tạo phí khác.

Hetzner chưa xác minh đủ SKU/capacity/traffic trên trang trả về; không dùng giá “from” để khẳng định đáp ứng. Region chưa chọn: phải phù hợp quyền operator, data processing và hợp đồng venue; không chọn region để vượt geoblock.

## Phương án cô lập

Một VPS Linux với non-root collector, local spool, không trading keys; một private R2 Standard bucket, public access/custom domain tắt. Build pin main SHA và lockfile. Reuse `infra/poly-collector/` và CLI hiện có, nhưng không giả định Rust systemd unit và TypeScript CLI có cấu hình/storage layout tương đương. Gate C/E cần kiểm thử tích hợp theo tài liệu 04/05 trước activation.

Luồng dự kiến: nguồn được cấp quyền → collector → segment đã đóng → manifest SHA-256 → private R2 → download/verify/replay độc lập. Collector không cần R2 credential; uploader dùng credential riêng, bucket-scoped. Chưa triển khai cơ chế tách này.

## Mô hình 150 markets, 30 ngày

Dùng **giả định chưa xác minh** 4.39 MB/market-hour. [PR #281](https://github.com/minhlongs/algo-trader/pull/281) ghi nhận drill 30 giây và 2.398 frame hợp lệ nhưng không cung cấp số byte và số thị trường cần thiết để tái tính 4.39. Không coi đây là throughput đo được, p95 hoặc cam kết capacity; không chạy lại live drill trong G8.2. Decimal GB, 720 giờ/tháng. Raw WAL = 4.39 × 150 × 720 / 1000 = **474.12 GB/30 ngày**.

Compression 3.5–6x trong cost-model là giả định, chưa đo cho universe 150 markets. Parquet là artifact bổ sung, không được mặc nhiên coi nó có cùng kích thước với compressed WAL. Mô hình dự phòng dưới đây dành một bản WAL và một bản Parquet có cùng raw-equivalent size; đây là allowance quy hoạch, không phải phép đo.

| Tham số | Bear Cost (thấp) | Base Cost | High Cost (stress) |
|---|---:|---:|---:|
| Throughput so với giả định 4.39 | 0.5x | 1x | 2x |
| Compression mỗi artifact | 6x | 3.5x | 1x |
| WAL + Parquet, steady rolling 30d GB | 79.02 | 270.926 | 1896.48 |
| R2 storage/tháng (làm tròn 80 / 271 / 1897 GB-month) | $1.20 | $4.07 | $28.46 |
| VPS | $24 | $24 | $24 |
| R2 operations (1M A + 1M B, không trừ miễn phí) | $4.86 | $4.86 | $4.86 |
| Monitoring/config backup reserve | $1 | $1 | $2 |
| Tổng trước thuế/license | **$31.06** | **$33.93** | **$59.32** |

Cả ba kịch bản vượt trần $30 nếu không dựa vào hạn mức miễn phí. Base là $33.93 trước thuế/phí/license. Chỉ xem allowance là kịch bản giảm chi phí khi đã xác nhận usage dùng chung của account; không tự đổi phạm vi. Không có finite worst-case bảo đảm khi data rate/giá/license chưa bị giới hạn: $59.32 là stress scenario định nghĩa ở đây, không phải maximum hóa đơn. Dừng thu thập không xóa ngay storage charges; billing alerts cũng không phải spending cap.

Giá tháng đầu khi tăng dần có thể thấp hơn steady 30-day retention; dùng steady state để tránh đánh giá thấp recurring cost. Không dự trù full duplicate R2 dataset backup: R2 là bản archive ngoài máy, local spool phục vụ recovery ngắn hạn, $1–2 chỉ là reserve monitoring/config backup. Nếu yêu cầu bản sao full thứ hai, phải cộng storage và xin duyệt lại. Phí luật sư và giấy phép dữ liệu chưa biết, không nằm trong các con số trên và không được tự chi. Phải trình cả chi phí hạ tầng lẫn các phí bắt buộc trước khi duyệt.

## Object, operation, disk và bandwidth

- Size thực tế object 150-market chưa đo. Đóng một object/giờ/artifact: raw WAL Base khoảng 658.5 MB/giờ; compressed WAL 188.14 MB với 3.5x hoặc 109.75 MB với 6x. Parquet là giả định tương đương, phải đo riêng.
- 720 giờ × (WAL + Parquet + manifest) = 2,160 objects/tháng; dự phòng 4,320 A và 8,640 B gồm list/head/restore; Cloudflare làm tròn lên mỗi triệu theo từng loại (và mỗi GB-month cho lưu trữ). Không dùng mức $0.0226 tính theo tỷ lệ làm hóa đơn. Bảng giả định stress cũng dưới 1M cho mỗi loại; multipart, retries, per-market sharding phải tính lại.
- Base raw WAL 15.804 GB/ngày, 48h = 31.608 GB. Nếu local Parquet tương đương raw cũng giữ 48h thì tổng 63.216 GB, cộng OS/log/staging có thể chạm trần 80 GiB disk. High không vừa. Phải đo spool occupancy; không bật auto-delete khi chưa xác minh restore.
- Base uploads 270.926 GB/tháng theo giả định nén, High 1.896 TB; restore/backup và retries cộng thêm outbound. 4,000 GiB transfer không đồng nghĩa không giới hạn bandwidth. Cần xác nhận throughput thực và overage rate trước mua.
- Không có billable inference trong dry run synthetic; genuine forecast inference cần budget riêng và cost ledger, chưa được phép gọi model tự động.

## Điều kiện Gate D và trình tự tương lai

Trước khi cấp phát: chốt báo giá theo vùng, thuế, phí bắt buộc và giá tiếp tục sử dụng; chứng minh dự toán trong trần từ bằng chứng sẵn có, dữ liệu thử ngoại tuyến và giới hạn tải. Nếu chưa chứng minh được thì giữ HOLD, không cấp phát để lấy số liệu mở gate. Chỉ sau A–F PASS mới đo 24 giờ và cập nhật dự toán tải cao, object size và tỷ lệ nén; đặt ngưỡng dừng ingest trước khi vượt ngân sách. Nếu projection >$30 thì HOLD, không tự giảm retention hay universe 150 để làm đẹp số.

Sau toàn bộ A–F PASS mới: provision một VPS/private bucket → 24h qualification → integrity/replay/cost review → 7 ngày thực → mở rộng universe nếu rights/capacity cho phép → bắt đầu 30 ngày. Tự dừng khi hết 24 giờ hoặc sớm hơn nếu chạm ngưỡng dừng. Phải duyệt lại kết quả và phạm vi trước khi bắt đầu 7 ngày, mở rộng hoặc chuyển sang 30 ngày. Không tính dry run hay 7 ngày chưa đạt tiêu chuẩn vào bằng chứng 30 ngày. Đây là kế hoạch có điều kiện, không phải lệnh thực thi.

## English — Cost and deployment decision

**HOLD.** The proposed isolated setup is one DigitalOcean Basic `s-2vcpu-4gb` Linux VPS ($24/month; 2 vCPU, 4 GiB RAM, 80 GiB SSD, 4,000 GiB outbound) and one private Cloudflare R2 Standard bucket. Confirm region, taxes, renewal, overage and deletion/billing terms before purchase. Region must be legally and contractually eligible; it must never bypass restrictions. Keep the non-root collector separate from the bucket-scoped uploader; no order keys or public bucket. The Rust service and TypeScript CLI are separate runtime paths, not interchangeable.

The unverified planning input of 4.39 MB per market-hour projects 474.12 GB of raw WAL for 150 markets over 30 days. Provisionally budgeting both WAL and Parquet at equal raw-equivalent sizes gives 79.02 / 270.926 / 1896.48 GB at 0.5× / 1× / 2× traffic and 6× / 3.5× / 1× compression. PR #281 confirms a 30-second drill but does not publish the byte and market-count inputs needed to reproduce this rate. Actual object size and compression are unmeasured. R2 charges $0.015 per GB-month, $4.50 per million Class A and $0.36 per million Class B operations, with no direct egress charge. Usage rounds up by billing unit. Plan for 2,160 objects, 4,320 Class A and 8,640 Class B operations per month; do not assume any shared free allowance is available. With monitoring/config backup reserves, rounded totals are **$31.06 / $33.93 / $59.32** before tax and licensing. The last figure is a stress scenario, not a maximum. A full second archive copy is not budgeted. Base-case 48h local WAL plus equivalent Parquet takes 63.216 GB before OS, logs and staging; stress does not fit. Confirm actual disk, transfer and operation peaks before extending collection. Billing alerts are not spending caps.

Only after A–F pass: provision → run a bounded read-only 24h qualification → verify integrity, replay and cost → complete seven days of operational qualification → expand only within rights and capacity → start the qualifying 30-day observation. Automatically stop at 24 hours or earlier on a failed safety check. Review the results and obtain explicit approval before advancing. No purchase, provisioning or collection is authorized by this document.
