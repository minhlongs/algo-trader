# Phase 7 — Đổi nhãn license cho đúng, không rút grant đã phát hành

## Goal

`CONTRIBUTING.md:10-12` công bố phân chia CE/EE: `src/desk/` thuộc nhánh **MIT**, và nhánh
"Cloud RaaS (EE) / Proprietary" gồm `src/raas/`, `src/billing/`, `src/durable-objects/`,
`src/seed/security/` — bảng đó **tự mô tả nhiệm vụ bảo vệ của mình** là "HMAC-SHA256 LicenseGate,
HTTP 402 BillingMeter". Nhưng `license-gate.ts` nằm trong `src/desk/`, và **43 file** trong
`src/desk/opencoresaas2026monetization/` mang `// SPDX-License-Identifier: MIT`. Riêng `LICENSE`
chỉ là MIT 21 dòng — **giấy phép thứ hai không tồn tại**. Thêm vào đó, `src/trading/` được liệt kê
trong bảng nhưng **không tồn tại**.

Đã kiểm chứng: repo PUBLIC, `ba708544` (commit sinh ra `license-gate.ts`) nằm trên
`origin/fix/signal-routes-tenant-isolation` và `origin/feat/triad-apex-deep-refactor-wave180-182`.
Vậy grant MIT **đã phát hành** — sửa header không rút lại được.

## Files (ownership: phase này)

READ first:
- `CONTRIBUTING.md`
- `LICENSE`
- `CLA.md`
- `src/desk/opencoresaas2026monetization/license-gate.ts`
- `src/desk/opencoresaas2026monetization/billing-meter.ts`

MODIFY:
- `CONTRIBUTING.md`
- 43 SPDX headers trong `src/desk/opencoresaas2026monetization/`

CREATE:
- `COMMERCIAL-LICENSE.md`

## Steps

1. Viết `COMMERCIAL-LICENSE.md`: đặt tên rõ thư mục `src/desk/opencoresaas2026monetization/`
   (và các file nó cần để chạy: `license-gate.ts`, phần metering/quota) là proprietary; nói rõ
   phần còn lại của repo vẫn MIT; nói rõ grant MIT đã phân phối qua commit `ba708544` trên hai
   nhánh remote **được giữ nguyên và không bị rút lại**.
2. **Không** xoá dòng SPDX MIT một cách khắp cả repo! Chỉ xoá ở các file thuộc thư mục
   entitlement/quota. Bundle `stitch-*` / `ui-ux-pro-max-*` (12 file) nhìn như không liên quan,
   và 11/12 đúng là vậy — **nhưng `stitch-ui-cockpit.ts` là ngoại lệ**: nó gọi
   `meter.checkQuota(...)` nên thuộc nhóm entitlement và phải đổi nhãn cùng các file gate.
   Xác nhận lại bằng grep trong lúc thi hành, đừng tin danh sách này một cách máy móc.
3. Sửa bảng `CONTRIBUTING.md`: bỏ `src/trading/` (không tồn tại); đặt tên đúng thư mục giữ
   LicenseGate thay vì miêu tả mơ hồ.
4. Ghi lại trong `COMMERCIAL-LICENSE.md` (hoặc một mục "Phân phối đã xảy ra") rằng bản MIT đã
   phát hành vẫn giữ quyền MIT. Đây là sự thật pháp lý, không phải lựa chọn.
5. **Không** `git mv` thư mục sang nhánh "proprietary" — nó đổi đường dẫn API
   `/api/v1/open-core/*` (mounted `server-routes-core.ts:93`) và phá public contract.
6. Cập nhật comment sai một từ ở `src/platform/marketplace/models/subscription-types.ts:50`
   (`platformShareCents: number; // 80%` → nền tảng 20%, theo `revenue.types.ts:3-4`).

## Validation

- `grep -rl "SPDX-License-Identifier: MIT" src/desk/opencoresaas2026monetization/license-gate.ts
  src/desk/opencoresaas2026monetization/billing-meter.ts` → 0
- `COMMERCIAL-LICENSE.md` tồn tại, đề cập tên thư mục entitlement gate
- `grep -c "src/trading" CONTRIBUTING.md` → 0
- `grep -rn "stash\|force\|-f --force" ` trong commit → 0 (không force-push, không sửa history)
- `git log --oneline` không có commit rewrite

## Risk

**Rủi ro chính là hiểu sai phạm vi.** Grant MIT đã phát hành **không thể rút**. Việc đổi nhãn chỉ
có hiệu lực về phía trước, cho người lấy bản mới. Nếu founder sau này bán binary/thư viện, nhánh
MIT của repo sẽ là nơi rò rỉ — và điều đó cần một kiến trúc riêng (tách package), không phải relabel.
Ngoài ra, xoá SPDX trên 43 file có nghĩa là diff lớn; nên tách commit riêng và nêu rõ trong PR.

## Rollback

`git revert` commit relabel; `COMMERCIAL-LICENSE.md` xoá được. Không ảnh hưởng code.
