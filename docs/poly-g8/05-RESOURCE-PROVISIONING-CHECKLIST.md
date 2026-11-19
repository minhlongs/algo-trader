# G8.2 — Danh sách điều kiện trước khi cấp phát tài nguyên

> **Bản công khai / Public copy — 2026-11-19:** Hồ sơ G8.2 tại baseline `7319b8d04305d14c95cd366a1593d3bdfa9235ec`; phát hiện và kết quả TEST_ONLY bên dưới là lịch sử, không phải kết luận sau sửa G8.3. Các nguồn pháp luật là đầu mối cần luật sư xác nhận, không phải ý kiến pháp lý. Mọi gate A–F vẫn HOLD. / Historical baseline findings and TEST_ONLY results, not post-remediation assurances; legal sources require counsel validation. No activation is authorized.


Ngày: 2026-11-19. Mốc mã nguồn đã đối chiếu: `7319b8d04305d14c95cd366a1593d3bdfa9235ec`.

**Hồ sơ chuẩn bị, không phải lệnh triển khai.** `INFRA_PREFLIGHT=HOLD`; `VPS_R2_PROVISIONING=NOT_AUTHORIZED`. **A–F đều HOLD, chưa gate nào được phê duyệt.** Không mua/cấp phát VPS hoặc R2, không cài dịch vụ, không kích hoạt timer, không upload, không thu thập thị trường, không gọi mô hình trả phí, không giao dịch. `G11/G12/G13=HOLD`; `REAL_MONEY_TRADING=DISABLED`.

Các nhãn trạng thái trong hai tài liệu 04/05 là trạng thái hồ sơ; không phải xác nhận đã thay đổi cờ hoặc chính sách trên hệ thống thật.

## 1. Phạm vi hoàn thành của G8.2

- Hồ sơ gồm [quyền dữ liệu](01-POLYMARKET-DATA-RIGHTS-ASSESSMENT.md), [pháp lý](02-VIETNAM-LEGAL-G12-COUNSEL-BRIEF.md), [chi phí](03-VPS-R2-COSTED-DEPLOYMENT-PLAN.md), [an toàn và khôi phục](04-DATA-SECURITY-AND-ROLLBACK.md) và checklist này.
- Đối chiếu mã và chạy TEST_ONLY bằng dữ liệu tổng hợp. Không sửa mã, test hoặc cấu hình. Không chạy collector CLI, uploader (kể cả DRY_RUN), hệ thống thật hay truy cập bí mật.

Hoàn thành tài liệu và kiểm thử TEST_ONLY **không đồng nghĩa hoàn thành điều kiện cấp phát**.

## 2. Ma trận gate A–F: tất cả chưa giải quyết

Bảng áp dụng sáu điều kiện kích hoạt trong phạm vi G8.2, không phải gate tự động. Các vai trò dưới đây là đề xuất, chưa có người ký duyệt. Không nhầm A–F ở đây với sáu nhóm hoạt động pháp lý trong tài liệu 02 hoặc gate G8 về trình duyệt trong tài liệu cũ.

| Gate | Phạm vi đề xuất | Bằng chứng bắt buộc trước khi xem xét PASS | Hiện có và điều còn thiếu | Trạng thái |
|---|---|---|---|---|
| A | Quyền sử dụng dữ liệu; Founder và bên sở hữu dữ liệu | Văn bản cho đúng operator/pháp nhân, API/WebSocket, universe, lưu WAL/Parquet, xử lý trên cloud, vùng, retention/deletion và phạm vi chia sẻ; ngày hiệu lực/thu hồi, phí | Tài liệu 01 mới chuẩn bị đánh giá/thư nháp; chưa có quyền bằng văn bản. Endpoint công khai không phải giấy phép | **HOLD** |
| B | Tư cách vận hành và pháp lý; Founder và luật sư độc lập | Kết luận có ngày/phạm vi/giả định rõ; dữ kiện operator được xác nhận; giới hạn pháp lý, xử lý dữ liệu và vùng; giấy phép/thủ tục cần thiết đã hoàn tất | Tài liệu 02 là hồ sơ đề nghị đánh giá, chưa phải ý kiến luật sư. Không tự kết luận paper hoặc nghiên cứu được miễn quy định; G12 chưa được mở | **HOLD** |
| C | An toàn, toàn vẹn và khôi phục; kỹ thuật/vận hành | Tách credential; quyền tối thiểu; chống ghi đè/xóa; tải về kiểm SHA-256 và replay; thử stop/rollback bằng dữ liệu giả, xác định thời hạn lưu và điểm phục hồi | DRY_RUN có nhánh xóa, uploader chỉ kiểm kích thước, collector còn đọc R2 credential. Chưa chứng minh tích hợp và khôi phục an toàn | **HOLD** |
| D | Ngân sách và quyền chi; Founder và người phụ trách chi phí | Quote đủ thuế/phí/license, region/renewal; dự toán universe 150 markets và retention đã duyệt, kịch bản cao, cảnh báo/ngừng nhận, người có quyền chi và xử lý vượt trần 30 USD/tháng | Base $33.93/tháng (chưa thuế/license, không giả định miễn phí); nén/throughput còn giả định, chưa có hóa đơn hoặc giới hạn chi tiêu thực. Không tự giảm universe/retention để làm đẹp số | **HOLD** |
| E | Nguồn gốc bản triển khai; kỹ thuật | SHA, lockfile/toolchain và checksum artifact; bản build tái lập; cấu hình thực thi và layout/manifest được đối chiếu, một đường Rust hoặc TS được kiểm thử tích hợp | SHA và CI đã biết, nhưng chưa chứng minh artifact/build/config của hệ thống collector dự kiến. Rust unit dùng `--tokens-file` không có trong CLI baseline; TS runtime và uploader chưa tương thích mặc định | **HOLD** |
| F | Quyết định cho phép bước kế tiếp; Founder và người phụ trách vận hành | Xác nhận A–E và cho phép bằng văn bản cấp phát một VPS + một bucket riêng và chạy thử chỉ đọc tối đa 24 giờ, tự dừng khi hết hạn, người thực hiện/giám sát/dừng, hạn mức, thời hạn, hồ sơ sự cố và checklist nghiệm thu sau cấp phát; quyền giao dịch vẫn tách riêng | Chưa có quyết định cấp phát/thu thập; chưa chỉ định người chịu trách nhiệm, chưa có thời điểm kích hoạt. Không suy từ tài liệu hoặc test ra quyền thực thi | **HOLD** |

Không đánh dấu PASS có điều kiện hoặc lấy một test đạt để bỏ qua một gate. Mọi thay đổi trạng thái cần người có thẩm quyền, bằng chứng tham chiếu và phạm vi được phép; không ghi bí mật hoặc privileged advice vào Git.

## 3. Danh mục tài nguyên cần xác nhận — chưa cấp phát

| Hạng mục | Việc cần chuẩn bị/xác nhận | Bằng chứng còn thiếu |
|---|---|---|
| Bản phần mềm | Pin SHA/lockfile; xác nhận artifact Rust hoặc TS, phiên bản WAL v3 và bộ đọc tương thích; giữ bản trước đó theo quyền sử dụng | Bản triển khai được duyệt và kiểm thử tích hợp; baseline hiện chỉ là mốc rà soát, không phải bản an toàn đã chứng nhận |
| VPS và vùng | Đối chiếu cấu hình/ngân sách tài liệu 03; chọn vùng theo quyền operator/data processing, không để né hạn chế; tài khoản non-root, quyền quản trị, đồng bộ UTC, giới hạn tài nguyên và ngừng nhận trước đầy đĩa | Region/quote và quyền chi; chưa có máy, kiểm tra tài nguyên thực hoặc kế hoạch người trực |
| Luồng lưu cục bộ | Chốt thư mục active/closed/staging/quarantine; không hash/upload tệp còn ghi; định danh session/segment không trùng sau restart; dung lượng OS/log/spool và khoảng dự phòng | Bộ đóng batch giữa collector/uploader; chính sách flush và kiểm thử lỗi đĩa, restart, batch không đầy |
| R2 riêng tư | Bucket/prefix riêng; public access/custom domain tắt; cơ chế bảo vệ khỏi ghi đè/xóa và lưu giữ phù hợp quyền dữ liệu; kiểm chứng mã hóa/đường truyền | Thiết kế chính sách và kiểm thử quyền; không mặc định đã bật object lock/versioning hoặc coi tên khóa là bất biến |
| Danh tính và bí mật | Tách collector không có R2 credential, uploader có quyền tối thiểu, restore chỉ đọc; tách quyền xóa; nguồn cấp bí mật an toàn, xoay/thu hồi và audit | Unit hiện đưa `r2.env` vào collector. Chưa triển khai tách quyền; không điền khóa mẫu hoặc đọc credential để làm hồ sơ |
| Universe và chất lượng | Danh sách market theo thời điểm, token/question/event ID, phiên bản bộ lọc, nguồn được phép, khoảng thiếu/reconnect và điều kiện ngày đủ chuẩn | Không dựa vào token/2 hoặc tên thư mục ngày để chứng nhận 150 markets/30 ngày; điều kiện loại trừ và tính độc lập câu hỏi cần duyệt |
| Sổ forecast | Đúng schema pipeline; nguồn evidence không lộ giá, model/prompt version, thời hạn khóa forecast, resolution, danh tính câu hỏi độc lập và head ngoài máy | Chốt quy tắc deduplicate/mẫu số; một người ghi hoặc cơ chế khóa; ghi bền vững, xử lý lỗi append, kiểm tra mất đuôi và backup/restore |
| Sổ chi phí | Tách ước tính và thực chi; VPS/storage/operation/retry/backup/thuế/license; inference có request ID, model/giá/ngày giá, token input/output/cache, retry, tiền tệ và đối soát | Chưa có sổ chi phí thực trong pipeline đã rà. Hạn tỷ lệ phí inference của hàm tính posterior không thay thế sổ chi hoặc trần tài khoản |
| Giám sát và lưu giữ | Kiểm tra bytes đã ghi bền vững, độ trễ, RAM/đĩa, thiếu dữ liệu, upload/restore, log và dự toán chi; chủ sở hữu, ngưỡng dừng, thời hạn lưu/xóa và quyền bảo toàn | Cấu hình systemd/logrotate là mẫu, chưa cài/đo. Cảnh báo không phải spending cap; dừng ingest không tự hết phí storage |

## 4. Các phép nghiệm thu còn thiếu

Các mục sau **CHƯA CHẠY — HOLD**; phải có công việc kỹ thuật riêng được chấp thuận, không tự sửa trong G8.2:

- Uploader: chứng minh DRY_RUN không tạo marker đủ điều kiện xóa và không xóa ở cả nhánh retention/đầy đĩa; hiện chỉ đọc mã, không chạy script có nguy cơ.
- Bảo vệ archive: từ chối ghi đè nhất quán; phát hiện thay byte nhưng giữ nguyên độ dài; manifest mất/sai; lỗi upload nửa chừng/retry; kiểm tra bản manifest từ xa. Không đồng nhất HEAD/size với kiểm tra nội dung.
- Collector TS: lỗi append, lỗi promise, giới hạn bộ đệm, dừng sạch phải đợi kết quả `start()`, SIGKILL và khởi động lại cùng đường dẫn không đụng segment/state; phân biệt số đếm RAM với số byte bền vững. Không dùng test JSONL recorder để thay bằng chứng runtime WAL.
- Ghép đường đi offline: collector đã chọn → batch đã đóng → manifest chung → kho giả cục bộ → thư mục restore mới → SHA-256/CRC32C/replay → evidence loader. Cần tệp thiếu/thừa, gap, symlink, sai schema và batch đang ghi bị từ chối.
- Ledger: đầu ghi duy nhất/khóa, lỗi ghi không để dùng state chưa persist, head độc lập phát hiện tiền tố thiếu đuôi, nguồn thời gian/giá/resolution và chính sách câu hỏi lặp; chi phí thực không được mặc định bằng 0 khi chưa đo.
- IC: bắt buộc manifest đúng tên/schema, chứng minh ngày đủ chuẩn thay vì tên ngày, loại TEST_ONLY, mẫu số câu hỏi phù hợp, truyền đúng `bssOos`/`ece`. `qualifyingMakerFills=0` trong loader không được thay bằng số giả.

Kiểm tra quyền bucket/VPS, restore R2, throughput 24 giờ, hóa đơn và hoạt động liên tục chỉ có thể nghiệm thu **sau quyết định cấp phát có thẩm quyền**. Đây là bước hậu cấp phát, không được ghi như bằng chứng đã có để mở gate hôm nay. Sau toàn bộ A–F được duyệt mới có thể xét một đợt qualification có giới hạn theo tài liệu 03; vẫn cần quyền thu thập cụ thể, tiêu chí tự dừng. Phê duyệt 24 giờ không bao gồm 7/30 ngày; cần duyệt lại trước khi chuyển bước. Không tính dữ liệu giả hoặc giai đoạn chưa đủ chuẩn vào 30 ngày thực; không cấp quyền giao dịch tiền thật.

## 5. Kiểm tra ngoại tuyến có thể tái lập

### 5.1. Điều kiện và ranh giới

- Chạy từ repo có sẵn dependencies; không tải gói/cài đặt hoặc thay lockfile. Nếu thiếu công cụ, ghi BLOCKED, không dùng `npx` để tự tải.
- Kiểm tra `git rev-parse HEAD` bằng baseline trên. Nếu khác, kết quả mới phải ghi mốc mới; không reset/rebase/stash hoặc xóa công việc của phiên khác.
- Tám tệp dưới đã được rà phạm vi: dữ liệu tổng hợp, tệp tạm; runtime dùng WebSocket loopback `127.0.0.1`, discovery/resnapshot được thay bằng hàm giả. Không có external market feed trong đường test này. Không thiết lập firewall chặn egress trong đợt kiểm tra; đây không phải chứng nhận cách ly mạng toàn máy.
- Cấu hình test hiện dùng `tests/setup-proxy-bypass.ts`, bỏ proxy; không dựa vào proxy để bảo đảm ngoại tuyến. Không thêm test/live CLI khác vào lệnh bên dưới nếu chưa rà side effect.

### 5.2. Tám tệp kiểm thử hiện có

Lệnh đã chạy, không coverage/build và không khởi động dịch vụ nền lâu dài:

```bash
cd /path/to/algo-trader
npm test -- \
  tests/polymarket/l2/l2-recorder.test.ts \
  tests/polymarket/l2/l2-collector-runtime.test.ts \
  tests/polymarket/l2/l2-archive-manifest.test.ts \
  tests/polymarket/l2/poly-book-wal-bridge.test.ts \
  tests/polymarket/market-blind-durable-ledger.test.ts \
  tests/polymarket/market-blind-prospective-pipeline.test.ts \
  tests/polymarket/ic-evidence-loader.test.ts \
  tests/polymarket/ic-kpi-scorecard.test.ts \
  --maxWorkers=1 --no-file-parallelism --no-cache
```

**TEST_ONLY — kết quả quan sát:** ngày 2026-11-19, bắt đầu 17:49:16 giờ máy; Node v26.7.0, Vitest v4.1.10, macOS. **8/8 tệp, 39/39 test đạt, mã thoát 0**, thời lượng 2,86 giây.

Phạm vi chứng minh: ghi JSONL theo thứ tự; codec/replay WAL; manifest và bản sao restore cục bộ; gap/resnapshot/reconnect với nguồn giả; hydrate/tamper ledger; phép tính chi phí giả; hành vi scorecard khi thiếu mẫu. Assertion mở skill với 160 forecast tổng hợp **không phải** 160 câu hỏi OOS thực hoặc ủy quyền hoạt động.

### 5.3. Kiểm tra cú pháp uploader, không thực thi

```bash
bash -n infra/poly-collector/poly-collector-upload.sh
```

**TEST_ONLY — mã thoát 0.** Bash này là 5.3.9; Bash hệ thống 3.2.57, không tìm thấy `flock` trên PATH khi rà. Không chạy uploader, không dùng DRY_RUN làm bằng chứng an toàn, không cài công cụ để thử upload/xóa. Kết quả cú pháp không kiểm tra quyền, định dạng manifest, khả năng chạy trên Linux hoặc restore R2.

### 5.4. Bốn phép kiểm tra tổng hợp không tạo tệp repo

Lệnh đã chạy từ repo, chỉ import module, dùng store trong bộ nhớ và một thư mục tạm rỗng; không gọi model/API/WebSocket hoặc tải dữ liệu ngoài. Thư mục tạm được xóa bằng `finally` và chỉ đường dẫn do chính phép kiểm tra tạo được xóa. Không dùng đường dẫn ledger/archive thật.

```bash
cd /path/to/algo-trader
node --import tsx --input-type=commonjs <<'NODE'
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { loadICEvidenceForScorecard } = require('./src/desk/polymarket/ic-evidence-loader.ts');
const { ProspectivePipelineLedger, submitMarketBlindForecast, attachPostCommitMarketSnapshot, recordMarketBlindResolution, evaluateProspectiveOosReport } = require('./src/desk/polymarket/market-blind/market-blind-prospective-pipeline.ts');
const base = Date.UTC(2026, 10, 19, 0, 0, 0);
const rows = [];
const store = { appendLine: line => rows.push(line), readAllLines: () => [...rows] };
const ledger = new ProspectivePipelineLedger(store);
const receipts = [0, 1].map(i => {
  const receipt = submitMarketBlindForecast(ledger, {
    questionId: 'TEST_ONLY-same-question', category: 'synthetic', pRaw: 0.6,
    modelVersion: 'TEST_ONLY', evidence: 'Synthetic document without market odds.',
    committedAtMs: base + i * 1000,
  });
  attachPostCommitMarketSnapshot(ledger, receipt, {
    marketProb: 0.5, marketReadAtMs: base + i * 1000 + 10, source: 'TEST_ONLY',
  });
  return receipt;
});
recordMarketBlindResolution(ledger, { questionId: 'TEST_ONLY-same-question', status: 'RESOLVED_YES', resolvedAtMs: base + 10000 });
const report = evaluateProspectiveOosReport(ledger);
assert.equal(new Set(receipts.map(r => r.questionId)).size, 1);
assert.equal(report.resolvedScoredCount, 2);
console.log(JSON.stringify({ label: 'TEST_ONLY', check: 'duplicate-question', distinctQuestions: 1, resolvedScoredCount: report.resolvedScoredCount }));
const prefix = rows.slice(0, 2);
const restored = ProspectivePipelineLedger.hydrateFromStore({ appendLine: () => { throw new Error('read-only'); }, readAllLines: () => [...prefix] });
assert.equal(restored.recordCount(), 2);
assert.equal(restored.verifyChainIntegrity(), true);
console.log(JSON.stringify({ label: 'TEST_ONLY', check: 'valid-prefix-tail-removal', originalRecords: rows.length, retainedRecords: restored.recordCount(), chainVerified: true }));
const failed = new ProspectivePipelineLedger({ appendLine: () => { throw new Error('TEST_ONLY append failure'); }, readAllLines: () => [] });
assert.throws(() => submitMarketBlindForecast(failed, {
  questionId: 'TEST_ONLY-write-failure', pRaw: 0.6, modelVersion: 'TEST_ONLY',
  evidence: 'Synthetic source text.', committedAtMs: base,
}), /TEST_ONLY append failure/);
assert.equal(failed.commitsByHash.size, 1);
assert.equal(failed.recordCount(), 0);
console.log(JSON.stringify({ label: 'TEST_ONLY', check: 'append-failure', inMemoryCommits: failed.commitsByHash.size, persistedRecords: failed.recordCount() }));
const root = mkdtempSync(join(tmpdir(), 'poly-g8-test-only-'));
try {
  mkdirSync(join(root, '2026-11-18'));
  const loaded = loadICEvidenceForScorecard({ l2ArchiveDir: root });
  assert.equal(loaded.samples.recordedL2Days, 1);
  assert.equal(loaded.integrity.l2ManifestChecked, false);
  assert.equal(loaded.integrity.l2ManifestOk, true);
  assert.deepEqual(loaded.integrity.errors, []);
  console.log(JSON.stringify({ label: 'TEST_ONLY', check: 'empty-dated-directory', days: loaded.samples.recordedL2Days, manifestChecked: loaded.integrity.l2ManifestChecked, manifestOk: loaded.integrity.l2ManifestOk, errors: loaded.integrity.errors }));
} finally { rmSync(root, { recursive: true, force: true }); }
NODE
```

**TEST_ONLY — mã thoát 0**, bốn kết quả đã quan sát:

| Phép kiểm tra | Kết quả | Diễn giải đúng |
|---|---|---|
| `duplicate-question` | `distinctQuestions=1`, `resolvedScoredCount=2` | Hiện tại đếm receipt; không được diễn giải thành 2 câu hỏi độc lập |
| `valid-prefix-tail-removal` | `originalRecords=6`, `retainedRecords=2`, `chainVerified=true` | Tiền tố còn hợp lệ không tự chứng minh không mất đuôi; cần head tin cậy ngoài bản khôi phục |
| `append-failure` | `inMemoryCommits=1`, `persistedRecords=0` | Instance có thể đi trước kho lưu sau lỗi append; phải có chính sách dừng/phục hồi |
| `empty-dated-directory` | `days=1`, `manifestChecked=false`, `manifestOk=true`, `errors=[]` | Bộ nạp đang đếm tên ngày, chưa chứng nhận dữ liệu đủ chuẩn |

Bốn probe này là kiểm tra trực tiếp bổ sung, **không cộng vào 39 unit test** và không tạo thêm test/source trong repo. Không tái hiện DRY_RUN xóa, TS crash/restart, mất điện hoặc multiwriter; những mục đó chỉ được kết luận trong giới hạn đọc mã/kiểm thử hiện có.

## 6. Hồ sơ bàn giao và quyết định cuối

- Tài liệu 04/05 ghi rõ baseline, nguồn, kết quả TEST_ONLY, giới hạn chưa chứng minh và bước tương lai có điều kiện. Lệnh kiểm tra scope cuối: `git diff --name-only`, `git status --short`; tệp mới chưa được Git theo dõi phải được kiểm tra riêng, không lấy diff trống làm bằng chứng không có tệp mới.
- Giữ nguyên các tệp chưa theo dõi của phiên khác. Không stage hoặc xóa chúng; không dùng reset/rebase để làm sạch cây làm việc.
- Không chạy toàn bộ `npm test`, build/typecheck, Rust test, external feed, deployment hay mua tài nguyên. Issue #278 là kênh bàn giao trạng thái duy nhất. Không có kết luận build/typecheck toàn dự án từ lần kiểm tra này.
- **Kết luận hiện tại: A=HOLD; B=HOLD; C=HOLD; D=HOLD; E=HOLD; F=HOLD.** Chưa có quyền vận hành trực tiếp. Dữ liệu thực/clearance/budget/khả năng khôi phục không được thay thế bằng tài liệu hoặc dữ liệu giả.

**Vấn đề chưa giải quyết:** cần chỉ định người phụ trách và người ký A–F; quyền dữ liệu và pháp lý; ngân sách đầy đủ; đường collector được chọn; flush/restart/upload/retention an toàn; head ledger, mẫu số câu hỏi và sổ chi phí; quyết định cho phép riêng cho từng bước sau này. Không tự mở gate hoặc yêu cầu thực hiện các bước đó trong nhiệm vụ này.

## English — Founder checklist

All gates are **HOLD**: **A** written rights for the precise operator, market universe, storage and use; **B** dated, independent Vietnamese legal opinion; **C** least privilege, safe upload and verified rollback; **D** documented costs at or below $30 per month (base estimate $33.93 before tax and licensing, without free allowances); **E** exact SHA, reproducible collector build and verified runtime configuration; **F** separate written Founder approval to provision one VPS and one private R2 bucket and run the bounded read-only 24-hour qualification.

**G8.3 correspondence authorization is limited:** one inquiry is authorized only through a verified Founder-authorized identity. That identity is unavailable; document 01 is READY_FOR_FOUNDER_SEND and remains unsent. That approval alone does not authorize spending, provisioning, collection or trading. Counsel engagement and any spend require their own authorization. Once A–F pass, verify actual security settings before ingest, stop no later than 24 hours, verify integrity/replay/cost and obtain separate approval before continuing. Then complete a genuine seven-day qualification, expand only if rights and capacity allow, and finally start the qualifying 30-day observation. Stop on any failed check. No TEST_ONLY result contributes to the empirical floors, and no step authorizes real-money trading.
