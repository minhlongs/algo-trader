# G8.2 — An toàn dữ liệu, khôi phục và quay lui

> **Bản công khai / Public copy — 2026-11-19:** Hồ sơ G8.2 tại baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`; phát hiện và kết quả TEST_ONLY bên dưới là lịch sử, không phải kết luận sau sửa G8.3. Các nguồn pháp luật là đầu mối cần luật sư xác nhận, không phải ý kiến pháp lý. Mọi gate A–F vẫn HOLD. / Historical baseline findings and TEST_ONLY results, not post-remediation assurances; legal sources require counsel validation. No activation is authorized.


Ngày: 2026-11-19. Mốc mã nguồn đã đối chiếu: `7319b8d04305d14c95cd366a1593d3bdfa9235ec`.

**Chỉ chuẩn bị.** `GATE_A=HOLD`, `GATE_B=HOLD`, `GATE_C=HOLD`, `GATE_D=HOLD`, `GATE_E=HOLD`, `GATE_F=HOLD`. Không cấp phát VPS/R2, không cài dịch vụ, không tải dữ liệu ra ngoài, không thu thập thị trường, không giao dịch. `G11/G12/G13=HOLD`; `REAL_MONEY_TRADING=DISABLED`. Quy ước gate và danh sách việc còn thiếu nằm ở [tài liệu 05](05-RESOURCE-PROVISIONING-CHECKLIST.md).

## 1. Phạm vi và cách đọc chứng cứ

- Đã đọc `CLAUDE.md`, `README.md`; rà hẹp `infra/poly-collector/`, collector TypeScript, WAL/manifest, Market-Blind và bộ nạp chứng cứ IC. Không thay đổi mã nguồn hoặc cấu hình.
- **Đối chiếu mã**: kết luận từ mã tại mốc trên, không phải kết quả triển khai. Bình luận trong mã hoặc kế hoạch G7 không tự tạo bảo đảm vận hành.
- **TEST_ONLY**: kiểm thử với dữ liệu tổng hợp, tệp tạm hoặc WebSocket `127.0.0.1`; không phải dữ liệu thị trường, ngày L2 hợp lệ, maker fill hoặc dự báo OOS thực.
- **Chưa kiểm chứng**: mất điện, SIGKILL, lỗi đĩa thực, nhiều tiến trình ghi, R2 thực, quyền truy cập triển khai, chi phí hóa đơn, RPO/RTO và hoạt động liên tục. Không chạy lại đợt thu thập trực tiếp G7.5.
- Phần hướng dẫn khôi phục bên dưới là **quy trình tương lai có điều kiện**, không phải lệnh đã thực hiện hay giấy phép vận hành. Không đọc/lưu bí mật, khóa ví, khóa giao dịch hoặc hồ sơ pháp lý riêng tư.

## 2. Ba luồng chưa được nối thành một hệ thống đã nghiệm thu

| Thành phần tại baseline | Hành vi thực tế | Không được suy diễn |
|---|---|---|
| [`poly-book-collector.service`](../../infra/poly-collector/poly-book-collector.service) | Khai báo chạy Rust `/opt/poly-collector/bin/poly-book`; WAL ở `/var/lib/poly-collector/wal`, Parquet ở `/var/lib/poly-collector/parquet`; cấu hình flush Parquet 300 giây; `Restart=always`, thời hạn dừng 30 giây | Không chạy CLI TypeScript. Unit truyền `--tokens-file` nhưng Rust CLI tại baseline chỉ khai báo `--tokens` hoặc `--auto-rotate`; cấu hình này chưa thể nghiệm thu |
| [`l2-collector-runtime.ts`](../../src/desk/polymarket/l2/l2-collector-runtime.ts), dòng 78–138, 190–198 | Ghi `<outDir>/capture/wal/segment_*.wal` và `<outDir>/capture/manifest.json` | Chưa sản xuất Parquet hoặc đóng gói `staging/<giờ UTC>` cho uploader |
| [`poly-collector-upload.sh`](../../infra/poly-collector/poly-collector-upload.sh), dòng 15–35, 99–218 | Chờ batch ở `staging/<YYYY-MM-DD-HH>`; tạo manifest riêng và tải lên | Ba tệp hạ tầng được rà soát chưa cung cấp bộ đóng batch/timer upload hoàn chỉnh; tên manifest và cách tính digest khác thư viện TypeScript |

Rà đường chạy Rust: [CLI](../../sidecars/poly-book/crates/pb-bin/src/main.rs#L45-L65) và [ingest](../../sidecars/poly-book/crates/pb-bin/src/commands/ingest.rs#L18-L98) dẫn vào feed rồi WAL/Parquet; [REST](../../sidecars/poly-book/crates/pb-feed/src/rest.rs#L72-L84) đọc sổ lệnh bằng GET. TS dùng WebSocket market và GET discovery/resnapshot. Không thấy gọi ký/gửi lệnh trong hai đường chạy đã rà, không phải chứng nhận toàn repo hoặc môi trường triển khai. Rust có xử lý SIGTERM và đường drain theo mã; chưa chạy thử unit hoặc dừng thật.

Không ghép cờ CLI, đường dẫn hoặc lời hứa của ba luồng này như thể đã tương thích. Phải chốt một đường triển khai, phiên bản định dạng, quyền sở hữu tệp và giao thức đóng batch trước Gate C/E.

## 3. Upload, xác minh và xóa: các điểm chặn bắt buộc

Căn cứ chính: [`poly-collector-upload.sh`](../../infra/poly-collector/poly-collector-upload.sh), dòng 5–10, 99–218.

| Tuyên bố hoặc kỳ vọng | Mã thực sự làm | Hệ quả và điều kiện còn thiếu |
|---|---|---|
| `DRY_RUN=1` không gây mất dữ liệu | `upload_object()` trả thành công ở dòng 148–151; `verify_remote_size()` cũng bỏ qua ở dòng 170–172; sau đó vẫn `touch .uploaded-verified` ở dòng 202 và chạy xóa ở dòng 207–217 | **Có đường dẫn xóa cục bộ dù không upload/verify từ xa.** Khi đầy đĩa, batch vừa đánh dấu có thể nằm trong nhóm bị xóa; nhánh lưu giữ cũng có thể xóa batch cũ. Không dùng DRY_RUN trên dữ liệu thật hoặc thư mục dùng chung |
| SHA-256 trước upload chứng minh batch đã niêm phong | Script tính hash hiện tại và ghi manifest `SEALED_VERIFIED` trước khi upload | Đây không phải so với một manifest niêm phong đáng tin cậy có trước; chưa chứng minh tệp không tiếp tục bị sửa trong khi hash/upload |
| Xác minh từ xa bằng size/ETag | Hàm `verify_remote_size()` chỉ so `Size` từ rclone hoặc `ContentLength` từ AWS với số byte cục bộ | Hai nội dung khác nhau có thể cùng độ dài. Không có so SHA-256 từ xa, tải về/replay hoặc xác minh manifest đã upload. ETag cũng không mặc nhiên là SHA-256 |
| Batch bất biến, không ghi đè | Nhánh rclone có `copyto --immutable`; nhánh AWS gọi `s3api put-object` không điều kiện chống ghi đè | Khóa object cố định không tự tạo tính bất biến. Chưa có bằng chứng chính sách khóa/lưu giữ phía bucket hoặc chống xóa; không coi cờ của một client là kiểm soát toàn hệ thống |
| Manifest chỉ xuất bản sau khi đủ bảo đảm | Archive chỉ qua kiểm tra độ dài rồi manifest được upload; nhánh DRY_RUN giả thành công cho cả hai | `BATCH_PUBLISHED`, `.uploaded-verified` và `SEALED_VERIFIED` hiện không đủ tư cách làm giấy phép xóa |
| Ghi đầy đủ khoảng thiếu/reconnect | Có nhánh `MISSING_INTERVAL`; số reconnect được đếm từ log collector, không phải sổ sự kiện đóng theo từng giờ | Không chứng minh đủ 24 giờ hoặc đủ universe. Thiếu dữ liệu phải giữ trạng thái thiếu, không bù synthetic để đủ mẫu |

**Trạng thái bằng chứng:** đường dẫn DRY_RUN/xóa và kiểm tra size-only được xác nhận bằng đọc mã; **không chạy uploader và không tái hiện xóa**. Kiểm tra `bash -n` chỉ xác nhận cú pháp. Máy kiểm tra có Bash Homebrew 5.3.9, Bash hệ thống 3.2.57; không tìm thấy `flock` trên PATH. Script dùng `mapfile`, `flock`, nhánh GNU `find -printf`; không coi chạy được trên macOS là mặc định và không cài thêm công cụ trong nhiệm vụ này.

Điều kiện thiết kế cần được triển khai/kiểm thử trong công việc riêng, chưa thực hiện ở đây:

1. Chế độ mô phỏng phải không tạo marker đủ điều kiện xóa và không gọi nhánh xóa; kiểm thử mọi nhánh retention/đầy đĩa trên tệp giả.
2. Đóng batch trước hash; dùng định danh bất biến và cơ chế từ chối ghi đè nhất quán; chỉ phát hành manifest sau xác minh nội dung.
3. Xác minh bản tải về bằng manifest niêm phong có nguồn tin cậy, checksum từng tệp và replay. Chỉ lấy hash do cùng một bản đã bị sửa sinh ra là chưa đủ.
4. Chỉ cho phép xóa sau bằng chứng khôi phục, thời hạn lưu giữ đã duyệt, không có yêu cầu bảo toàn và quyết định rõ ràng. Khi chưa đủ điều kiện, ngừng nhận thêm dữ liệu trước đầy đĩa, không xóa bằng chứng chưa xác minh.

## 4. TypeScript: flush, dừng và khởi động lại

Căn cứ: [`l2-collector-runtime.ts`](../../src/desk/polymarket/l2/l2-collector-runtime.ts), dòng 78–138, 144, 169–198; [`poly-l2-collector.ts`](../../scripts/poly-l2-collector.ts).

- Frame nằm trong `pendingFrames`; `framesWritten`/`bytesWritten` tăng khi đưa vào RAM, **không phải xác nhận đã ghi bền vững**. Mặc định xoay segment sau 3.600 giây; ngoài xoay/flush khi hoàn tất, không thấy chu kỳ ghi bền vững ngắn riêng. Chưa có fsync/fdatasync, giới hạn bộ đệm hoặc cơ chế dừng theo đĩa/ngân sách trong runtime này.
- `pendingFrames.splice(0)` lấy frame khỏi bộ đệm trước khi `appendFile` hoàn tất. Xử lý mất dữ liệu khi append thất bại cần kiểm thử lỗi riêng; chưa có kết quả thực nghiệm trong đợt này. Chuỗi xử lý message và callback xoay định kỳ cũng chưa chứng minh phục hồi sau promise bị từ chối.
- `stop()` đóng kết nối, hủy timer/listener và giải phóng tín hiệu chờ; bản thân `await stop()` không đợi xả hết message/ghi đĩa. Đường `start()` tiếp tục đợi `msgChain` rồi flush. Chỉ khi promise `start()` hoàn tất thành công mới có kết quả cuối của đường dừng sạch; vẫn chưa chứng minh chịu mất điện.
- Tạo runtime mới đặt `segmentId=0`, bộ đếm/sequence/ordinal mới; không đọc segment cũ để chọn ID tiếp theo hoặc khôi phục checkpoint. Tái dùng `outDir` có thể append vào `segment_00000000000000000000.wal` cũ và thay manifest. **Chưa có bảo đảm segment bất biến hoặc restart-safe.** Chưa chạy phép thử tái dùng thư mục/SIGKILL trong đợt này.
- Phép thử append qua hai lần mở của [`l2-recorder.test.ts`](../../tests/polymarket/l2/l2-recorder.test.ts) thuộc recorder JSONL riêng, không chứng minh runtime WAL khởi động lại an toàn.
- Runtime có phát hiện sequence gap và thử resnapshot. `HEALTHY` sau resync không có nghĩa archive không có gap; kiểm tra restore yêu cầu `sequenceGaps=0`. Sequence WAL sinh cục bộ không được đồng nhất với tính liên tục của sequence nguồn.
- Codec có kiểu reconnect nhưng đường reconnect runtime chưa thấy ghi `ReconnectStart`/`ReconnectSuccess` vào WAL; `reconnectCount` trong RAM không thay thế nhật ký bền vững.
- Discovery là lựa chọn ban đầu, không thấy lưu universe theo thời điểm hằng ngày. CLI không đặt bộ lọc loại trừ crypto 5 phút; không suy diễn bảo đảm chống thiên lệch lựa chọn từ tên hàm discovery.
- CLI không có cờ offline/DRY_RUN. `--verify-restore` xóa thư mục con `restore`, sao chép capture **cục bộ** rồi kiểm tra; không tải lại R2. **Không chạy CLI này để làm kiểm tra ngoại tuyến.**

## 5. Market-Blind: thứ tự, mẫu số, tính bền vững và chi phí

Căn cứ: [`market-blind-prospective-pipeline.ts`](../../src/desk/polymarket/market-blind/market-blind-prospective-pipeline.ts), dòng 62–128, 133–194; [`node-market-blind-ledger-adapter.ts`](../../src/desk/polymarket/market-blind/node-market-blind-ledger-adapter.ts).

| Chủ đề | Có trong mã/kiểm thử | Khoảng trống phải giữ HOLD |
|---|---|---|
| Niêm phong trước giá | Lọc dấu hiệu lộ giá; yêu cầu receipt đã niêm phong; chặn `marketReadAtMs < committedAtMs` và resolution không sau commit | Timestamp do người gọi cấp; chưa có chứng thực thời gian độc lập hoặc bằng chứng môi trường suy luận không nhìn thấy giá. Chưa thấy điều kiện `marketReadAtMs <= resolvedAtMs` |
| Mẫu số OOS | `commitsByQuestion` là mảng; resolution theo question xử lý các commit chưa resolve; báo cáo dùng `scored.length` | **Đếm receipt, không bắt buộc đếm câu hỏi độc lập.** TEST_ONLY: 2 commit của 1 `questionId` tạo `resolvedScoredCount=2`. Không được đổi thành “2 câu hỏi OOS” hoặc cộng lặp để đạt 150 |
| Trạng thái resolution | YES/NO có giá tham chiếu được chấm; VOIDED/CANCELLED/UMA_DISPUTED được lưu và loại khỏi Brier nhị phân | Cần chốt nguồn resolution, định danh câu hỏi/sự kiện, phiên bản forecast, thời điểm khóa và chính sách giải quyết tranh chấp trước dữ liệu thực |
| Hash chain | Hydrate kiểm tra chuỗi JSONL ngoài và chuỗi forecast trong; test phát hiện sửa byte, đảo dòng, dòng bị cắt dở | Hash không phải chữ ký hoặc WORM. TEST_ONLY: bỏ toàn bộ đuôi, giữ 2/6 bản ghi là một tiền tố hợp lệ vẫn hydrate/verify thành công. Cần head độc lập, bản sao/checkpoint được bảo vệ và chính sách chống quay lui |
| Quyền tệp và lưu bền vững | Adapter append đồng bộ, áp `0600` cho tệp; từ chối CR/LF trong một bản ghi | Không thấy fsync, khóa nhiều tiến trình, mã hóa, sao lưu ngoài máy hoặc giao dịch nguyên tử giữa state RAM và tệp. `0600` không ngăn chủ tệp sửa/xóa; thư mục cha theo umask |
| Lỗi ghi | `commit` và `resolve` sửa state trước `persist` | TEST_ONLY với store cố tình ném lỗi: còn 1 commit trong RAM nhưng 0 bản ghi được persist. Phải dừng/quarantine và hydrate lại từ bản đáng tin, không tiếp tục dùng instance lỗi như đã bền vững |
| Kiểm tra khi đang chạy | `verifyChainIntegrity()` kiểm tra chuỗi forecast trong RAM | Không tự đọc lại tệp JSONL ngoài để phát hiện sửa tệp sau khi instance đã tạo |
| Chi phí suy luận | Commit lưu model/prompt version và hash ngữ cảnh | Không có request ID nhà cung cấp, token input/output/cache, giá áp dụng, phí retry hoặc đối soát ngân sách trong payload/report được rà soát. Không có chứng cứ inference thực hoặc sổ chi phí thực |

Constructor không được truyền store thì dùng bộ nhớ. API [`DurableMarketBlindLedger`](../../src/desk/polymarket/market-blind/market-blind-ledger-store.ts) cũ dùng `MARKET_READ_AFTER_COMMIT`; pipeline hiện dùng `MARKET_SNAPSHOT`. Cùng giao diện lưu không đồng nghĩa cùng schema; không nhập lẫn hai định dạng.

Chính sách mẫu số cần duyệt trước: một dự báo khóa trước thời hạn cho mỗi đơn vị câu hỏi/sự kiện đủ điều kiện; các bản sửa giữ để audit nhưng không tự tăng số mẫu độc lập; báo cáo riêng số receipt, số question ID và nhóm câu hỏi tương quan. Đây là **đề xuất phương pháp, chưa được cài đặt**. Kết quả skill trên 160 mẫu giả trong unit test không phải bằng chứng kỹ năng dự báo.

## 6. Bộ nạp IC chưa chứng nhận ngày hợp lệ

Căn cứ: [`ic-evidence-loader.ts`](../../src/desk/polymarket/ic-evidence-loader.ts), dòng 49–110, 135–173; [`ic-kpi-scorecard.ts`](../../src/desk/polymarket/ic-kpi-scorecard.ts).

1. Manifest chỉ được kiểm tra nếu tồn tại. Mặc định tìm `l2-archive-manifest.json`, trong khi TS runtime phát `capture/manifest.json`. Thiếu manifest không tự trả lỗi toàn vẹn.
2. `collectDistinctUtcDays()` đếm mẫu chữ `YYYY-MM-DD` trong tên thư mục/tệp, kể cả thư mục rỗng. Không chứng minh ngày lịch hợp lệ, đủ 24 giờ, ngày liên tiếp, universe đầy đủ, CRC WAL hoặc replay liên tục. TEST_ONLY: 1 thư mục ngày rỗng cho `recordedL2Days=1`, `manifestChecked=false`, `manifestOk=true`, `errors=[]`.
3. Đường dẫn không tồn tại cho số mẫu 0 nhưng không thêm lỗi; khác với lời bình luận đầu tệp về lỗi rõ ràng cho nguồn bị thiếu. Manifest hỏng/ledger chain hỏng có nhánh đưa số mẫu về 0, đã có kiểm thử tương ứng.
4. Ledger truyền `resolvedScoredCount` sang IC nên kế thừa mẫu số receipt. Chưa thấy bộ lọc provenance để loại dữ liệu TEST_ONLY; phải cô lập đầu vào giả ngoài cây chứng cứ thực.
5. Loader gán `brierSkillScoreOos`/`brierEce`, còn kiểu đầu vào và evaluator đọc `bssOos`/`ece`. Đây là lệch tên trường được xác nhận qua mã, chưa có kiểm thử truyền metric đúng trong nhóm test hiện tại; không báo là lỗi biên dịch đã quan sát.
6. `qualifyingMakerFills` luôn bằng 0 trong loader. Các sàn 30 ngày L2, 500 maker fills đủ điều kiện, 150 dự báo OOS đã resolve **không được đáp ứng bởi đợt TEST_ONLY này**. Kết quả loader không phải quyền bật giao dịch.

Manifest TypeScript kiểm SHA-256/size/tệp thiếu hoặc thừa; restore kiểm CRC32C, số frame/step, gap/mismatch và replay hash. Replay hash lấy tối đa 10 mức giá mỗi phía cùng metadata, không phải hash mọi mức sổ lệnh. Digest TS dùng mảng tuple `[relativePath,sizeBytes,sha256]`, khác cách script shell hash mảng object; bộ lọc phần mở rộng cũng khác (`.wal.zst` có trong uploader nhưng không trong builder TS). Cần hợp đồng manifest thống nhất, không coi các định dạng hiện tại thay thế trực tiếp cho nhau.

## 7. Ranh giới bảo mật và lưu giữ dự kiến

Các mục dưới đây là yêu cầu trước triển khai, **chưa được xác minh trên tài nguyên thật**:

- VPS cô lập, tài khoản non-root, không khóa ví/order signer, không dữ liệu khách hàng SaaS; giới hạn egress đúng nguồn được cấp quyền, không né hạn chế địa lý. API/metrics chỉ nội bộ; unit hiện đặt loopback nhưng chưa có kiểm tra firewall triển khai.
- Collector không cần khóa R2; uploader dùng danh tính riêng, phạm vi bucket/prefix tối thiểu; danh tính khôi phục chỉ đọc; quyền xóa được tách và phê duyệt. Unit hiện nạp `/etc/poly-collector/r2.env` vào collector, **chưa thực hiện tách credential** như thiết kế ở [tài liệu 03](03-VPS-R2-COSTED-DEPLOYMENT-PLAN.md).
- Bí mật chỉ trong cơ chế cấu hình được bảo vệ, không ghi giá trị vào repo, manifest, log, dòng lệnh hoặc báo cáo. Cần chính sách xoay/thu hồi, chủ sở hữu và audit; không kiểm tra bằng cách in biến môi trường.
- Bucket riêng tư, tắt public access/custom domain; xác minh quyền truy cập, mã hóa khi lưu và TLS theo nhà cung cấp. Script kiểm tiền tố HTTPS nhưng chưa chứng minh TLS tối thiểu 1.2 hoặc cấu hình remote rclone đúng endpoint. Hash không thay thế mã hóa.
- Lưu riêng WAL gốc, manifest niêm phong, ledger, head/checkpoint, phiên bản binary/schema, universe theo thời điểm và nhật ký sự cố. Không công khai market archive, prompt/evidence nhạy cảm, định danh cá nhân hoặc ý kiến luật sư.
- `LOCAL_RETENTION_HOURS=48`, ngưỡng đĩa 80% và logrotate 14 bản là mặc định mẫu, không phải chính sách đã phê duyệt hoặc trần chi phí cứng. `copytruncate` không chứng minh log không mất dòng. Quyền dữ liệu quyết định thời hạn lưu/xóa; yêu cầu bảo toàn có thể xung đột retention và phải được xử lý bằng văn bản.
- Mã chi phí TS dùng giả định nén 3,5–6 lần, đơn giá R2 và khoảng giá VPS gắn sẵn; CLI ước lượng số market bằng số token chia hai. Chưa có sổ chi phí thực, toàn bộ phí request/retry/backup/thuế/license/inference hoặc cơ chế giới hạn chi tiêu. Không dùng bytes đang nằm trong RAM làm số liệu hóa đơn.

## 8. Quy trình sự cố, khôi phục và quay lui — chưa thực hiện

| Bước tương lai | Bằng chứng bắt buộc | Điều kiện dừng |
|---|---|---|
| 1. Khoanh vùng | Ghi thời gian UTC, phiên bản, phạm vi ảnh hưởng; ngừng nguồn phát sinh lỗi và tác vụ tự động upload/prune theo quyền được duyệt; thu hồi credential nếu nghi lộ | Không tiếp tục xóa/ghi đè để “dọn sạch”; không bật lại bằng `Restart=always` khi đang điều tra |
| 2. Bảo toàn | Giữ nguyên WAL/ledger/manifest/log và head đáng tin trước sự cố; sao chép có kiểm soát sang vùng cách ly, ghi hash và người xử lý | Không sửa bản gốc, không bỏ dòng xấu hoặc tạo manifest mới để che mất sai lệch |
| 3. Chọn điểm phục hồi | Xác định batch cuối đã kiểm chứng độc lập, quyền sử dụng còn hiệu lực, binary/schema tương thích; khai báo khoảng mất/không chắc chắn | RPO/RTO chưa được phê duyệt hoặc chưa đo thì ghi “chưa xác định”, không hứa không mất dữ liệu |
| 4. Khôi phục vào vùng mới | Đọc bằng quyền tối thiểu, đối chiếu manifest niêm phong/head ngoài bản phục hồi; kiểm size/SHA-256 từng tệp, tệp thừa/thiếu, symlink, CRC32C và replay | Sai hash, chain, số frame, continuity hoặc phiên bản → HOLD/quarantine; không dùng chế độ bỏ corruption để chứng nhận archive |
| 5. Phục hồi ledger | Hydrate đúng schema; so head/số bản ghi với checkpoint độc lập; rà duplicate question, thứ tự timestamp, provenance và chi phí | Tiền tố hợp lệ nhưng thiếu đuôi vẫn là mất dữ liệu; hash chain tự nó không đủ để chấp nhận |
| 6. Quay lui phần mềm | Chọn bản đã duyệt và tương thích dữ liệu; giữ bản lỗi phục vụ điều tra; ghi rõ segment/session mới và điểm nối | Baseline `7319b8d…` là mốc kiểm toán, **không phải bản vận hành an toàn đã được phê duyệt**. Không tái dùng thư mục TS mù quáng hoặc hạ phiên bản WAL không tương thích |
| 7. Đánh giá lại | So hồ sơ quyền dữ liệu, pháp lý, chi phí, an toàn và chất lượng mẫu; có phê duyệt rõ phạm vi chạy lại | TEST_ONLY/khôi phục thành công không tự chuyển A–F hoặc G11/G12/G13 sang PASS |

Chấm dứt tài nguyên, xoay khóa hoặc xóa dữ liệu cũng là thao tác thật cần thẩm quyền riêng. Ngừng collector không tự dừng phí storage hoặc kết thúc hợp đồng. Không có thao tác sự cố/khôi phục/quay lui nào được chạy trên hệ thống thật trong nhiệm vụ này.

## 9. Kết quả kiểm tra ngoại tuyến ngày 2026-11-19

| Nhóm | Kết quả đã quan sát | Giới hạn |
|---|---|---|
| Vitest 4.1.10, Node v26.7.0, macOS; 8 tệp chọn lọc | **39/39 test đạt**, 8/8 tệp đạt, mã thoát 0; bắt đầu 17:49:16 giờ máy, thời lượng 2,86 giây | TEST_ONLY; runtime test dùng WebSocket loopback và dữ liệu/fetch/resnapshot giả. Không phải thử R2 hoặc thị trường thật |
| `bash -n` với Bash Homebrew | Mã thoát 0 | Chỉ cú pháp uploader; không chạy upload/prune |
| Probe duplicate question | 1 câu hỏi, 2 receipt được chấm | Xác nhận mẫu số hiện tại, không phải thêm mẫu OOS |
| Probe bỏ đuôi ledger | Từ 6 bản ghi giữ tiền tố 2; hydrate và chain verify vẫn thành công | Chứng minh cần head độc lập; không sửa ledger thực |
| Probe lỗi append | 1 commit trong RAM, 0 bản ghi persist | Store giả ném lỗi; không mô phỏng mất điện thật |
| Probe thư mục ngày rỗng | 1 ngày được đếm, không kiểm manifest, không lỗi | Tệp tạm đã xóa; không đưa vào evidence thật |

Lệnh tái lập chính xác và bốn probe ở [mục kiểm tra ngoại tuyến của tài liệu 05](05-RESOURCE-PROVISIONING-CHECKLIST.md#5-kiểm-tra-ngoại-tuyến-có-thể-tái-lập). Không chạy toàn bộ suite, build, typecheck, Rust tests, benchmark 24 giờ, DRY_RUN uploader, crash/restart drill hoặc external feed. Các kiểm thử đạt không khép lại khoảng trống ngoài phạm vi assertion hiện có.

## English — Security and recovery handoff

**HOLD.** The Rust systemd service, TypeScript capture CLI and shell uploader are not a validated end-to-end pipeline. The unit passes `--tokens-file`, which the baseline Rust `ingest` CLI does not accept. No signing or order submission was found in the reviewed feed paths. The collector service currently receives R2 credentials; the intended design keeps those with a separate bucket-scoped uploader. Keep the host isolated and non-root, the bucket private, and all order-signing credentials off the host. The uploader's dry-run path can still mark data eligible for deletion; it was not run. Size-only remote checks do not prove content integrity. TypeScript restart and durable flush are not verified.

If authorized operations later fail: (1) stop ingest, upload and pruning; (2) preserve original WAL, ledger, manifests and trusted checkpoints; (3) restore in a fresh location using separate read-only access; (4) independently verify file hashes, WAL CRC32C, replay continuity, ledger head and provenance; (5) quarantine mismatches and obtain a fresh decision before resuming. No automatic deletion or restart after a failed check. RPO/RTO and live restore remain unverified.

**TEST_ONLY:** 39 selected tests passed. Four probes showed receipt duplication, a valid but truncated ledger prefix, memory ahead of disk after a failed append, and an empty dated directory counted as one L2 day. None qualifies as market evidence. Ordering checks use caller timestamps; model/prompt/context identifiers do not establish trusted source provenance or inference spend. Require authenticated source and time records, a fixed out-of-sample counting policy and independent ledger checkpoints before accepting real samples. The scorecard stays at zero qualifying L2 days, maker fills and OOS forecasts; `w_skill=0` for real eligibility.
