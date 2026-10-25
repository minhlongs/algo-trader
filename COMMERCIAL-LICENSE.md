# Commercial License / Giấy Phép Thương Mại

**Project / Dự án:** `@mekong/algo-trader` (`cashclaw`)
**Applies to / Áp dụng cho:** the entitlement & quota gate inside `src/desk/opencoresaas2026monetization/`

---

## 1. What this file is / Tệp này là gì

| | |
|:---|:---|
| **EN** | This repository is dual-licensed. The main `LICENSE` file stays **MIT** and covers the open core. This file names the small part of the tree that the maintainers keep proprietary, so there is no ambiguity about which rules apply where. It is a plain-language statement of scope — it is not a paid license offer, and it does not create a contract. |
| **VI** | Kho mã nguồn này dùng **hai giấy phép**. Tệp `LICENSE` chính vẫn là **MIT** và bao phủ phần lõi mở. Tệp này chỉ **nêu tên** phần nhỏ được giữ lại làm proprietary (độc quyền), để không ai nhầm lẫn giấy phép nào áp dụng cho đâu. Đây là văn bản mô tả phạm vi bằng ngôn ngữ thường — nó **không phải** lời chào bán giấy phép trả phí, cũng không tạo ra hợp đồng. |

---

## 2. What is proprietary / Phần nào là proprietary

### 2.1 Proprietary scope / Phạm vi proprietary

| | |
|:---|:---|
| **EN** | The following files inside `src/desk/opencoresaas2026monetization/` are proprietary. They implement the paid access gate — the HMAC license check, the metered usage quota, and the tier table that gate reads. |
| **VI** | Các tệp sau trong `src/desk/opencoresaas2026monetization/` là proprietary. Chúng hiện thực cổng kiểm soát truy cập trả phí — kiểm tra giấy phép HMAC, hạn mức sử dụng đo đếm, và bảng tier mà cổng đó đọc. |

**The gate files / Các tệp cổng:**

| File / Tệp | Role / Vai trò |
|:---|:---|
| `license-gate.ts` | HMAC-SHA256 license gate — signs and verifies tokens, returns HTTP 401/402 |
| `billing-meter.ts` | Quota meter — `BillingMeter`, `checkQuota`, `TIER_QUOTAS` / `TIER_ENTITLEMENTS` |
| `catalog.ts` | Defines `TierLevel` (`BASIC \| PREMIUM \| ENTERPRISE \| MASTER`) — the tier enum the gate reads |
| `step-gate-probes.ts` | Behavioral probes that exercise the gate and the meter in both directions |
| `step-behavior-probes.ts` | Registers the gate and quota probes against the step catalog |
| `step-boundary-probes.ts` | Probes that require the gate and meter to exist and to be wired |
| `step-enforcement-probes.ts` | Four-tier entitlement probe over the tier table |
| `readiness-auditor.ts` | Verdict that requires the gate and the meter to be enforced |
| `stitch-ui-cockpit.ts` | Cockpit snapshot — reads `TIER_ENTITLEMENTS` and the durable meter |
| `__tests__/license-gate-hardening.test.ts` | Gate test suite |
| `__tests__/step-behavior-probes.test.ts` | Gate and quota probe test suite |
| `__tests__/step-enforcement-probes.test.ts` | Tier entitlement probe test suite |
| `__tests__/readiness-verdict-honesty.test.ts` | Gate-enforcement verdict test suite |

| | |
|:---|:---|
| **EN** | **The rest of the repository remains MIT.** Every strategy engine, BYOK adapter, paper-trading sandbox, CLI command, UI theme, telemetry builder, and governance probe outside that list keeps the MIT terms in `LICENSE`. |
| **VI** | **Phần còn lại của kho mã vẫn là MIT.** Mọi engine chiến lược, bộ điều hợp BYOK, môi trường paper-trading, lệnh CLI, giao diện, bộ telemetry và governance probe nằm ngoài danh sách trên đều giữ nguyên điều kiện MIT trong `LICENSE`. |

### 2.2 Why these files and not others / Vì sao chọn các tệp này

| | |
|:---|:---|
| **EN** | The list above was decided by reading each file, not by its name. A file belongs to the gate only if it defines, implements, or configures the gate, the quota/entitlement enforcement, or the tier table the gate reads. Files that merely mention a tier word in a comment, a screen title, or a test fixture path were **not** included. In particular the `stitch-*` telemetry builders and `stitch-ui-themes.ts` stay MIT: they carry `minTier` metadata that no code reads to make a decision. |
| **VI** | Danh sách trên được quyết định bằng cách **đọc từng tệp**, không phải bằng tên tệp. Một tệp thuộc về cổng chỉ khi nó định nghĩa, hiện thực hoặc cấu hình cổng, cơ chế hạn mức/quyền lợi, hoặc bảng tier mà cổng đọc. Các tệp chỉ nhắc từ "tier" trong comment, tên màn hình hoặc đường dẫn test fixture **không** được đưa vào. Cụ thể, các bộ telemetry `stitch-*` và `stitch-ui-themes.ts` vẫn là MIT: chúng mang siêu dữ liệu `minTier` mà không có đoạn mã nào đọc để ra quyết định. |

---

## 3. Distribution that already happened / Phân phối đã xảy ra

This is a factual statement, not a choice. / Đây là sự thật, không phải lựa chọn.

| | |
|:---|:---|
| **EN** | **The MIT grant for these files has already been distributed, and we do not revoke it.** Commit `ba708544` published this repository publicly under the MIT license, including the files listed in §2.1. That commit exists on two public remote branches: `origin/fix/signal-routes-tenant-isolation` and `origin/feat/triad-apex-deep-refactor-wave180-182`. Anyone who obtained a copy from that commit, or from any public branch that contains it, keeps the full MIT rights to that copy — use, copy, modify, merge, publish, distribute, sublicense, and sell, per the terms in `LICENSE`. |
| **VI** | **Quyền MIT đối với các tệp này đã được phân phối, và chúng tôi không rút lại.** Commit `ba708544` đã công bố kho mã nguồn này công khai theo giấy phép MIT, bao gồm cả các tệp liệt kê trong §2.1. Commit đó nằm trên hai nhánh remote công khai: `origin/fix/signal-routes-tenant-isolation` và `origin/feat/triad-apex-deep-refactor-wave180-182`. Bất kỳ ai đã lấy bản sao từ commit đó, hoặc từ bất kỳ nhánh công khai nào chứa nó, đều **giữ nguyên toàn bộ quyền MIT** đối với bản sao đó — sử dụng, sao chép, sửa đổi, hợp nhất, công bố, phân phối, cấp phép lại và bán lại, theo đúng điều kiện trong `LICENSE`. |

| | |
|:---|:--|
| **EN** | **This relabel is forward-only.** Removing the `// SPDX-License-Identifier: MIT` header line from those files changes the notice for people who take a copy **from now on**. It cannot and does not reach backwards. This is why the header change is worth making carefully and describing honestly in a pull request — its effect is prospective only. |
| **VI** | **Việc đổi nhãn này chỉ có hiệu lực về phía trước.** Việc xoá dòng `// SPDX-License-Identifier: MIT` khỏi các tệp đó chỉ thay đổi thông báo cho người lấy bản sao **từ thời điểm này trở đi**. Nó không thể và không rút lại quyền đã cấp trước đó. Vì vậy việc sửa header cần được làm cẩn thận và mô tả trung thực trong pull request — hiệu lực của nó chỉ hướng về tương lai. |

| | |
|:---|:---|
| **EN** | **A revoked-in-practice copy would need a different architecture.** The MIT branch of this repository is, and will remain, a complete working copy of the gate. Selling a binary or hosted service does not change that, and no license text can. Keeping the paid gate genuinely closed needs the gate split into a separately published package — a code-structure decision, not a relabeling one. |
| **VI** | **Nếu muốn bản sao MIT thực sự không dùng được, cần kiến trúc khác.** Nhánh MIT của kho mã này là, và sẽ vẫn là, một bản sao hoàn chỉnh của cổng. Việc bán binary hay dịch vụ hosted không thay đổi điều đó, và không văn bản giấy phép nào thay đổi được. Để giữ cổng trả phí thực sự đóng, cần **tách cổng thành package công bố riêng** — đó là quyết định về cấu trúc mã, không phải về đổi nhãn. |

---

## 4. How to comply / Cách tuân thủ

| | |
|:---|:---|
| **EN** | You do **not** need a commercial license to use, study, fork, or self-host anything in the MIT part of this repository. You need one only to use the files in §2.1 **in a product or service you operate or sell**, or to redistribute them under terms other than MIT. To ask about a commercial license: **open a GitHub issue titled "Commercial license enquiry"** or contact the maintainers through the address published in `package.json`. Until an individual written agreement exists, treat §2.1 as reserved-rights rather than granted. |
| **VI** | Bạn **không** cần giấy phép thương mại để dùng, nghiên cứu, fork hoặc tự host bất cứ thứ gì trong phần MIT của kho mã. Bạn chỉ cần khi dùng các tệp trong §2.1 **trong sản phẩm hoặc dịch vụ mà bạn vận hành hoặc bán**, hoặc khi phân phối lại chúng theo điều kiện khác MIT. Để hỏi về giấy phép thương mại: **mở một GitHub issue với tiêu đề "Commercial license enquiry"** hoặc liên hệ maintainer qua địa chỉ công bố trong `package.json`. Cho đến khi có thỏa thuận viết riêng, hãy coi §2.1 là quyền được bảo lưu chứ không phải đã cấp. |

---

## 5. Contributor terms / Điều kiện với người đóng góp

| | |
|:---|:---|
| **EN** | Contributors agree to the terms in [`CLA.md`](./CLA.md), which already describes this open-core dual-license model. A contribution that lands in a §2.1 file is accepted on the understanding that the maintainers may ship it in both the MIT edition and the proprietary edition. |
| **VI** | Người đóng góp đồng ý với điều khoản trong [`CLA.md`](./CLA.md), tệp đã mô tả mô hình hai giấy phép open-core này. Một đóng góp rơi vào tệp thuộc §2.1 được chấp nhận với hiểu biết rằng maintainer có thể phân phối nó ở cả bản MIT lẫn bản proprietary. |

---

## 6. Related documents / Tài liệu liên quan

| Document | What it states |
|:---|:---|
| [`LICENSE`](./LICENSE) | MIT terms for the open core, and for every copy already distributed |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | The directory boundary table, stated truthfully |
| [`CLA.md`](./CLA.md) | Contributor license terms and dual-license governance |
