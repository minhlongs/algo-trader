# Hướng Dẫn Tái Lập Regression Advisory GHSA-965c-763c-88jm (CVE-2026-114607)

Tài liệu này cung cấp hướng dẫn và mã nguồn để tái lập đối đầu (adversarial verification) lỗ hổng **GHSA-965c-763c-88jm** giữa phiên bản chưa vá (`better-auth@1.6.29`) và phiên bản đã vá (`better-auth@1.7.7`) trong môi trường fixture cô lập, tuyệt đối không làm ảnh hưởng đến mã nguồn hoặc dependencies trên nhánh PR.

---

## 1. Cơ Chế Lỗ Hổng & Bản Vá

### Lỗ hổng (Vulnerable: `better-auth < 1.7.7`)
- Khi một ứng dụng kích hoạt đồng thời cả plugin `magicLink` và các nhà cung cấp `socialProviders` (OAuth), Better Auth lưu token trong bảng/bộ sưu tập `verification` mà không phân biệt tiền tố namespace (`identifier` lưu chuỗi token trần).
- Kẻ tấn công có thể khởi tạo luồng OAuth qua `signInSocial({ provider: 'github', additionalData: { email: victimEmail } })`, nhận về tham số `state`.
- Kẻ tấn công sau đó gửi `state` đó đến endpoint `/api/auth/magic-link/verify?token=<state>`. Endpoint này tìm thấy `state` trong bảng `verification` và cấp thẳng session cookie đăng nhập dưới danh nghĩa `victimEmail` mà không cần quyền truy cập hộp thư của nạn nhân.

### Bản vá (Patched: `better-auth >= 1.7.7`)
- Better Auth bắt buộc phân tách tiền tố namespace trong bảng `verification`:
  - Luồng OAuth lưu với tiền tố: `auth-state:<state>`.
  - Luồng Magic Link lưu với tiền tố: `magic-link:<token>`.
- Kẻ tấn công sau đó gửi `state` sang `/api/auth/magic-link/verify`, hàm xác thực tìm kiếm khóa với tiền tố `magic-link:<token>` nên không khớp. Yêu cầu bị từ chối với lỗi `INVALID_TOKEN` (redirect `error=INVALID_TOKEN` hoặc HTTP 400), và **tuyệt đối không cấp session cookie**.

---

## 2. Kiến Trúc Fixture: Một Runner Dùng Chung

Cả hai bài tái lập (old-red và new-green) đều gọi **cùng một** entry point `run-reproducer.ts`, tức là cùng một đoạn setup và cùng một bộ assertion. Lý do phải dùng chung:

- Nếu mỗi phiên bản có script tự viết riêng, hai script có thể trôi dạt về logic; một kết quả đỏ có thể xuất phát từ lỗi setup (thiếu `state`, đổi API, sai biến môi trường) thay vì đúng hành vi bảo mật cần chứng minh.
- `run-reproducer.ts` đọc **phiên bản thực sự đang được nạp** từ manifest của package mà Node resolve được (`require.resolve('better-auth')`), không hề gán cứng chuỗi phiên bản trong kết quả.
- Cờ `--expect <version>` bắt buộc phiên bản đang nạp phải khớp với phiên bản mà người chạy tuyên bố đang kiểm thử. Nếu lệch, runner thoát với mã **3** và không đưa ra bất kỳ kết luận PASS/FAIL nào.

Các tệp trong fixture:

| Tệp | Vai trò |
|---|---|
| `reproducer-core.ts` | Fixture Better Auth + luồng khai thác, trả về `ReproducerResult` (phiên bản thật đọc từ manifest, HTTP status, cookie, redirect, identifier thực tế). |
| `run-reproducer.ts` | CLI dùng chung. In bằng chứng và kết luận; mã thoát chuẩn hóa. |
| `package.old-red.json` + `package-lock.old-red.json` | Khóa phiên bản dễ tổn thương `1.6.29` cho bài tái lập old-red. |
| `../integration/better-auth-ghsa-965c-reproducer.test.ts` | Bài kiểm thử new-green chạy trong CI trên nhánh PR (dùng `1.7.7` đang ghim trong `package.json`, không downgrade). |

### Mã thoát (exit codes)

| Mã | Nghĩa |
|---|---|
| `0` | Bản đã vá: không mints cookie, có tín hiệu từ chối tường minh, identifier được phân tách namespace. |
| `1` | Bản dễ tổn thương (cookie được cấp) HOẶC bị chặn nhưng thiếu bằng chứng bản vá — không tính là xanh. |
| `2` | Lỗi setup (reproducer không chạy hết được) — không phải kết luận bảo mật. |
| `3` | Phiên bản đang nạp không khớp `--expect`. |

---

## 3. Các Bước Tái Lập (Reproduction Steps)

### Bước 3.1: New-GREEN — Bản Đã Vá (`better-auth@1.7.7`, nhánh PR hiện tại)

Chạy từ thư mục gốc của repository:

```bash
npx vitest run tests/integration/better-auth-ghsa-965c-reproducer.test.ts
```

**Kết quả thực tế đã ghi nhận:**
```text
RUN v4.1.10 tests/integration/better-auth-ghsa-965c-reproducer.test.ts

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  707ms
Exit code: 0
```

Có thể chạy trực tiếp cùng runner dùng chung để lấy log chi tiết:

```bash
npx tsx tests/fixtures/better-auth-ghsa-965c/run-reproducer.ts --expect 1.7.7
```

**Kết quả thực tế đã ghi nhận:**
```text
[Reproducer] Loaded better-auth version: 1.7.7
[Reproducer] Reporting version: 1.7.7
[Reproducer] HTTP status: 302
[Reproducer] Set-Cookie: null
[Reproducer] Redirect location: http://localhost:3000/?error=INVALID_TOKEN
[Reproducer] Stored identifiers: ["auth-state:gHe6si-e3d5xGqTsVi4mBSZaXwpgnHjz","magic-link:uWNbKWYCFMfFaflJYEzEWqBgganwazPD"]
🟢 EXPLOIT BLOCKED (Patched build 1.7.7 >= 1.7.7): no cookie, explicit rejection, namespaced verification identifiers.
Exit code: 0
```

---

### Bước 3.2: OLD-RED — Bản Chưa Vá (`better-auth@1.6.29`)

Thực hiện trong một thư mục tạm thời độc lập **ngoài** repo (không bao giờ sửa `package.json` của nhánh PR):

```bash
# 1. Tạo thư mục cách ly riêng, không nằm trong repo
mkdir -p /tmp/ghsa965c-old-red
cd /tmp/ghsa965c-old-red

# 2. Copy đúng bộ runner/assertion dùng chung và khóa phiên bản dễ tổn thương
cp <repo>/tests/fixtures/better-auth-ghsa-965c/reproducer-core.ts .
cp <repo>/tests/fixtures/better-auth-ghsa-965c/run-reproducer.ts .
cp <repo>/tests/fixtures/better-auth-ghsa-965c/package.old-red.json package.json
cp <repo>/tests/fixtures/better-auth-ghsa-965c/package-lock.old-red.json package-lock.json

# 3. Cài đặt tuyệt đối theo lockfile đã khóa (bám sát version, không resolve bản khác)
npm ci --no-audit --no-fund

# 4. Chạy.
npx tsx run-reproducer.ts --expect 1.6.29
```

**Kết quả thực tế đã ghi nhận:**
```text
[Reproducer] Loaded better-auth version: 1.6.29
[Reproducer] Reporting version: 1.6.29
[Reproducer] HTTP status: 200
[Reproducer] Set-Cookie: better-auth.session_token=eIZCOYjURL15cIGwnVRsJdp67t5AmorN.ka0RYF7uNduF2Rc7j64umpgt9jjM2%2BpqWrikM5Re7Cs%3D; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax
[Reproducer] Redirect location: null
[Reproducer] Stored identifiers: ["tlXJKriODbRYSjLNZOOwaPtVuyOpxfOk"]
🔴 EXPLOIT SUCCESSFUL (Vulnerable build 1.6.29 < 1.7.7): OAuth state minted a victim session cookie via Magic Link verify.
Exit code: 1
```

**Xác nhận đây là đỏ do hành vi bảo mật, không phải lỗi cài đặt:**

| Tín hiệu | 1.6.29 (old-red) | 1.7.7 (new-green) | Kết luận |
|---|---|---|---|
| HTTP status | `200` | `302` | Khác biệt, không phải crash setup |
| `Set-Cookie` | có `better-auth.session_token` | `null` | Lỗ hổng hiện diện ở bản cũ |
| `Redirect` | `null` | `error=INVALID_TOKEN` | Bản cũ đi thẳng vào luồng đăng nhập |
| `verification` identifiers | `["tlXJ..."]` (token trần, không tiền tố) | `["auth-state:...","magic-link:..."]` | Nguyên nhân gốc: không phân tách namespace |
| Exit code | `1` | `0` | Cùng một runner, cùng một assertion |
| Phiên bản thực tế (đọc từ manifest) | `1.6.29` | `1.7.7` | Trùng khớp `--expect`, exit `≠ 3` |

Setup ở cả hai lần chạy đều tới được điểm phát sinh lỗ hổng (OAuth `state` tồn tại, magic-link token tồn tại); runner sẽ thoát mã `2` nếu bất kỳ bước setup nào thất bại. Vậy đỏ/của xanh đến từ hành vi kiểm tra token, không phải cấu hình.

---

## 4. Ranh Giới Đánh Giá Khả Năng Khai Thác (Exploitability Boundaries)

1. **Dependency Affected:** `better-auth < 1.7.7` chứa lỗ hổng logic xác thực khi dùng chung OAuth và Magic Link.
2. **Fixture Exploitable:** Có — tái lập thành công trong môi trường cô lập khi bật đồng thời hai plugin.
3. **Production Exploitability (giới hạn theo source đã kiểm tra):** Duyệt qua `src/platform/auth/auth-server.ts` trên nhánh này, ứng dụng chỉ bật `emailAndPassword`, không bật `magicLink` hay `socialProviders`. Kết luận được rút ra **trong phạm vi đoạn mã nguồn đã kiểm tra**; nếu sau này plugin OAuth hoặc Magic Link được bật, kết luận này không còn giá trị và cần kiểm thử lại. Việc nâng cấp lên `1.7.7` bắt buộc bất kể điều đó, để xóa bỏ rủi ro ở tầng thư viện và giữ Gate 2 (`pnpm audit --audit-level=critical`) xanh.
