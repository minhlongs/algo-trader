# PLAN — Bootstrap `algo-trader` → `/ak-ship --auto --parallel`

> Người lập: Khổng Minh (kongming) · 2026-08-12 · Repo: `/Users/macbook/algo-trader`
> Nguồn yêu cầu: `.orchestrate/latest/task.md` · **Thay thế bản plan trước** (xem `plan-verdict.md`, `execution.md`)

---

## TL;DR

`/mk-bootstrap` và `/ak-ship` **không tồn tại dưới dạng CLI chạy được** trên máy này. Phải dịch sang **skill/subagent native** của Claude Code (`ak-bootstrap`, `ak-ship`), `--parallel` = **các lane sở hữu file rời nhau**.

Trước khi ship có 3 chốt chặn, xử lý đúng thứ tự: **(P0) token bí mật nằm trong diff chưa commit của một file ĐANG được git theo dõi** → cấm commit cả cây; **(P1) lint repo-wide 278 warning vs ngưỡng CI Gate 1 là 50**; **(P2) GitHub Actions im từ 2026-03-28** nên không có bằng chứng gate, phải thay bằng chạy gate ở local.

Nền tảng tốt: `tsc --noEmit` **exit 0**, production **HTTP 200**.

---

## 1. Hiện trạng đã kiểm chứng (đo trong phiên này)

### 1.1 Git
| Mục | Giá trị |
|---|---|
| Branch | `feat/arbitrage-lint-fixes` |
| HEAD local | `cde25fe45` |
| Remote branch | `f1d80085f` → **1 commit chưa push** |
| PR | #218 OPEN, MERGEABLE, `statusCheckRollup: []` (0 check) |
| Dirty tree | 118 entry; 59 file có diff thật (+1512 / −630) |
| Remote | `github.com/longtho638-jpg/algo-trader` |

### 1.2 Chất lượng
- `npx tsc --noEmit` → **exit 0, 0 lỗi** ✅
- `npm run lint` (`eslint src --max-warnings 100`) → **exit 1**: **0 error / 278 warning**
  - 251 × `@typescript-eslint/no-unused-vars`
  - 18 × `@typescript-eslint/no-require-imports`
  - 3 × `no-explicit-any` · 3 × `no-empty-object-type`
- `node scripts/ci-gate-secret-scan.mjs` → exit 0 (**phạm vi quét chỉ `src scripts migrations workers`** — xem P0)
- Test: **935 file test**, vitest. Bản plan trước ghi nhận **4215/4215 pass**; **chưa xác minh lại trong phiên này** → bắt buộc chụp baseline trước khi sửa.

### 1.3 CI/CD
- Workflows: `ci.yml` (Gate 1–7), `cloudflare-deploy.yml`, `ci-cd.yml`, `deploy.yml`, `dns-update.yml`, `load-test.yml`
- **`gh run list -L 5` chỉ trả 1 run, ngày 2026-03-28** → CI thực tế đã ngừng kích hoạt dù có nhiều commit sau đó.
- Gate 1 chạy `npx eslint src/ --max-warnings 50` → **278 hiện tại sẽ FAIL** nếu CI sống lại.
- Gate 3 chỉ lint **file thay đổi** với `--max-warnings 0` → hiện PASS (khớp `execution.md`).
- Gate 1 còn chạy `node scripts/validate-strategies.mjs` và `npx vitest run`.

### 1.4 Hạ tầng Cloudflare (`wrangler.toml`)
- **KV**: binding `CACHE`
- **D1**: binding `SUBSCRIBERS`, db `algo-trader-db`, `migrations_dir = migrations`
- **Durable Objects**: `SHARD_MANAGER` + `SHARD_0..11` (`StrategyShard`)
- **R2: KHÔNG có binding nào** — chưa dùng R2
- Contract có hiệu lực: **`CLAUDE.deploy.md`** (Cloudflare Pages, cấm Vercel, squash merge, báo cáo Binh-pháp 11 dòng). Phần multi-region VPS trong `CLAUDE.md` **đã lỗi thời**.

### 1.5 Smoke production (vừa đo)
- `https://algo-trader.pages.dev` → **HTTP/2 200** ✅
- `https://cashclaw.cc` → phản hồi (103 early hints, chain sống) ✅
- `https://algo-trader.workers.dev/api/health` → **000, không tới được** → Worker không phải đường live hiện tại

### 1.6 Google Sheets / Telegram
- **Google Sheets: KHÔNG tồn tại trong codebase.** Chỉ có `fonts.googleapis.com` trong 2 file CSS. Mọi việc liên quan Sheets là greenfield → **ngoài phạm vi lần ship này**.
- **Telegram: có thật, đang chạy.** `grammy ^1.33.0`; `src/platform/telegram/bot.ts`, `leaderboard-handler.ts`, `auto-support-handlers.ts`, `src/desk/signal/telegram-signal-pusher.ts` → **luồng được bảo vệ, cấm chạm**.

### 1.7 Toolchain agent (quyết định cách thực thi)
| Công cụ | Trạng thái |
|---|---|
| `$HOME/bin/ak` (AgentKit Go 2.4.0) | Chạy được nhưng **chỉ còn kit `core` rỗng (0 command/agent/skill)**. `ak ship` → `unknown command`. `ak doctor`: `engineer/claude-code: invalid version directory` |
| `~/.claude/commands/ak-ship.md` | Shell tới `$HOME/bin/ak ship` → **chết** |
| `mk` = `npx tsx $MEKONG_ROOT/harness/bin/mk.ts` | **HOẠT ĐỘNG** (53 command, 6 agent, 0 skill) — nhưng **không có `bootstrap`, không có `ship`**; chỉ cook/fix/plan/review/deploy/audit |
| `/mk-bootstrap` | **Không tồn tại.** Chỉ có `bootstrap.md` = scaffolder dự án mới → sai công cụ cho repo trưởng thành |
| Skill `ak-bootstrap`, `ak-ship` | **Tồn tại, chạy được native** → đây là đường đi đúng |

> **Kết luận:** hiện thực `--auto --parallel` bằng **subagent native** (planner → fullstack-developer → tester → code-reviewer → git-manager). Không phụ thuộc binary `ak`. **Bỏ hẳn bước "bootstrap scaffold"** — repo đã 5 tháng tuổi, scaffold sẽ phá cấu trúc.

---

## 2. CHỐT CHẶN — xử lý đúng thứ tự

### 🔴 P0 — Bí mật trong working tree (CẤM COMMIT CẢ CÂY)
`.claude/settings.json` **đang được git theo dõi**, và diff chưa commit **thêm vào một `ANTHROPIC_AUTH_TOKEN` dạng plaintext** cùng `ANTHROPIC_BASE_URL` nội bộ.
- Gate 2 **không bắt được**: phạm vi quét là `src scripts migrations workers` (không gồm `.claude/`), và pattern `sk-[A-Za-z0-9]{48}` không khớp định dạng token này.
- **Bắt buộc trước mọi `git add`:**
  1. `git checkout -- .claude/settings.json` (bỏ diff chứa token) **hoặc** chuyển env sang file không theo dõi.
  2. Cân nhắc `git rm --cached .claude/settings.json` + thêm `.gitignore` nếu muốn giữ cấu hình máy cá nhân.
  3. **Tuyệt đối không** `git add -A` / `git commit -a` trong repo này.
  4. Kiểm tra lịch sử: `git log -p --all -- .claude/settings.json | grep -c AUTH_TOKEN` — nếu > 0 thì **phải xoay token**, sửa file là chưa đủ.

### 🟠 P1 — Lint vượt ngưỡng CI
278 warning vs ngưỡng Gate 1 = 50. **251/278 là `no-unused-vars`** → sửa cơ học, rủi ro thấp (prefix `_` hoặc xóa import chết). Mục tiêu **≤ 50**, lý tưởng ≤ 20.

### 🟡 P2 — CI chết → không có bằng chứng gate
Không run nào từ 2026-03-28 (nghi do push bằng `GITHUB_TOKEN` — theo thiết kế không kích hoạt workflow).
- **Không treo pipeline chờ `gh pr checks`.** Chạy lại toàn bộ gate ở **local**, ghi kết quả làm bằng chứng thay thế.
- Sau đó thử đánh thức CI: `gh workflow run ci.yml --ref <branch>`, hoặc push commit rỗng bằng credential người dùng.

### 🟢 P3 — Vệ sinh repo
- `.gitignore` **thiếu**: `.mekong/`, `.orchestrate/`, `.claude/agent-memory/`, `landing/plans/reports/` → đang untracked, chứa state runtime (`goals.sqlite3`, `memory.yaml`, memory của agent).
- `core.autocrlf = true` (cả global lẫn local) trên macOS, **không có `.gitattributes`** → nguy cơ diff toàn file do đổi line-ending. **Đặt `git config core.autocrlf input` trước khi stage.**

---

## 3. Kế hoạch thực thi

### Phase 0 — Triage & An toàn (TUẦN TỰ, không song song)
1. `git config core.autocrlf input`.
2. Xử lý P0; xác minh `git diff --cached` sạch bí mật.
3. Bổ sung `.gitignore` (mục P3).
4. Phân loại 59 file diff thành 3 rổ: **(a)** code `src/` + tests → ship; **(b)** `docs/` + `plans/` → ship kèm; **(c)** rác runtime → bỏ.
5. Chụp baseline test: `npx vitest run > /tmp/at-vitest-baseline.log 2>&1` — lưu **danh sách test fail dạng văn bản**, so sánh theo **tập**, không theo **đếm**.
6. Push commit `cde25fe45` còn thiếu lên `feat/arbitrage-lint-fixes`.

**Gate ra:** index không còn bí mật · baseline test dạng văn bản · remote = local.

---

### Phase 1 — Song song, 3 lane sở hữu file rời nhau

| Lane | Agent | Sở hữu file | Nhiệm vụ |
|---|---|---|---|
| **A — Lint** | `fullstack-developer` | `src/**/*.ts` (TRỪ `src/platform/telegram/**`, `src/desk/signal/**`) | Hạ 278 → ≤ 50 warning. Chỉ sửa `no-unused-vars` (prefix `_` / xóa import chết) và `no-require-imports` khi chuyển ESM an toàn. **Cấm đổi logic.** |
| **B — Tài liệu** | `docs-manager` | `docs/**`, `plans/**`, `CLAUDE*.md` | Đồng bộ `docs/project-changelog.md`, `docs/development-roadmap.md`; **gỡ mục multi-region VPS lỗi thời trong `CLAUDE.md`** cho khớp `CLAUDE.deploy.md`. |
| **C — CI & Bảo mật gate** | `debugger` | `.github/workflows/**`, `.gitignore`, `scripts/ci-gate-*.mjs` | Chẩn đoán vì sao CI im từ 2026-03-28; **mở rộng `ci-gate-secret-scan.mjs` sang `.claude/**` và file config JSON** để bịt lỗ P0 ở cấp gate. |

**Quy tắc:** mỗi lane commit riêng, không chạm file ngoài phạm vi; va chạm → dừng và báo lead.
**Vùng cấm tuyệt đối:** `src/platform/telegram/**`, `src/desk/signal/**`, `wrangler.toml`, `migrations/**` (Telegram + D1 + Durable Objects đang chạy production).

---

### Phase 2 — Verify (tuần tự, sau khi 3 lane xong)
1. `npx tsc --noEmit` → exit 0 (đang sạch, phải giữ sạch)
2. `npx eslint src/ --max-warnings 50` → exit 0
3. `node scripts/validate-strategies.mjs` → exit 0
4. `npx vitest run` → **so tập fail với baseline Phase 0; điều kiện: 0 fail mới**
5. `node scripts/ci-gate-secret-scan.mjs` → exit 0
6. `pnpm audit --audit-level=critical` → exit 0
7. `code-reviewer` → **≥ 9.0/10, 0 critical**

---

### Phase 3 — SHIP (theo `CLAUDE.deploy.md`)
1. Commit theo conventional commit, tách theo lane, **không AI reference**.
2. `git push -u origin feat/arbitrage-lint-fixes`.
3. Cập nhật PR #218: dán **bằng chứng gate chạy local**, ghi rõ "GitHub Actions dormant từ 2026-03-28".
4. Thử đánh thức CI: `gh workflow run ci.yml --ref feat/arbitrage-lint-fixes`. Trần chờ **5 phút/gate**, quá thì dùng bằng chứng local — **không treo pipeline**.
5. Merge: `gh pr merge 218 --squash --delete-branch`.
   - Nếu required-contexts kẹt vì CI chết → **cần quyết định của người dùng**. **Mặc định đề xuất: merge kèm `--admin` và ghi lý do vào PR body**, vì toàn bộ gate đã chứng minh xanh ở local. Điều lật ngược: CI sống lại được ở bước 4 → bỏ `--admin`, chờ check thật.
6. Cloudflare Pages tự deploy → `wrangler pages deployment list --project-name algo-trader | head -10` phải có `success`.
7. Smoke: `curl -sI https://algo-trader.pages.dev` → 200; `curl -sI https://cashclaw.cc` → 200.
8. **Không** áp dụng migration D1 (không có migration mới trong payload này).
9. Xuất **báo cáo xác minh Binh-pháp 11 dòng** đúng khuôn `CLAUDE.deploy.md`. Gate nào không có bằng chứng CI thì ghi `⚠️ local-verified` — **cấm ghi ✅ giả**.

---

## 4. Việc KHÔNG làm (chống phình phạm vi)
- ❌ Không tích hợp Google Sheets — không có dấu vết trong repo, là dự án mới.
- ❌ Không đụng Telegram bot, D1 schema, Durable Object shards, `wrangler.toml`.
- ❌ Không thêm R2 (chưa có binding, chưa có nhu cầu — YAGNI).
- ❌ Không chạy `/ak:bootstrap` chế độ scaffold dự án mới.
- ❌ Không sửa binary `ak` / kit `engineer` trong lần ship này (ghi vào tồn đọng).
- ❌ Không `git add -A`.
- ❌ Không `sleep N && cat` khi chờ lệnh chậm (Claude Code chặn pattern này → kẹt pipeline). Ghi output ra file rồi Read.

---

## 5. Checklist thực thi
- [ ] P0: gỡ token khỏi `.claude/settings.json`, xác minh index sạch
- [ ] `core.autocrlf=input`; bổ sung `.gitignore`
- [ ] Chụp baseline vitest (danh sách fail dạng văn bản)
- [ ] Push `cde25fe45`
- [ ] Lane A: lint ≤ 50 warning
- [ ] Lane B: đồng bộ docs, gỡ mục VPS lỗi thời trong `CLAUDE.md`
- [ ] Lane C: mở rộng secret-scan, chẩn đoán CI
- [ ] tsc 0 · eslint ≤50 · validate-strategies 0 · vitest 0 fail mới · secret-scan 0 · audit critical 0
- [ ] code-reviewer ≥ 9.0/10
- [ ] Cập nhật PR #218 kèm bằng chứng local
- [ ] Merge squash → CF Pages `success` → smoke 200 × 2
- [ ] Báo cáo Binh-pháp 11 dòng (đánh dấu trung thực gate local-verified)

---

## 6. Thước đo thành công
1. `git diff --cached` không chứa bí mật — **điều kiện tiên quyết**
2. `npx eslint src/ --max-warnings 50` exit 0 (278 → ≤ 50)
3. Tập test fail sau ≤ tập baseline (0 hồi quy)
4. PR #218 merged, branch xóa
5. `algo-trader.pages.dev` + `cashclaw.cc` HTTP 200 sau deploy
6. Báo cáo 11 dòng đầy đủ, không có ✅ nào thiếu bằng chứng

---

## 7. Giả định (thay cho câu hỏi)
| # | Giả định | Độ tin | Điều gì lật ngược |
|---|---|---|---|
| 1 | "`/mk-bootstrap` → `/ak-ship --auto --parallel`" = **dịch sang subagent native**, không phải đi sửa binary `ak` | Cao | Người dùng nói rõ mục tiêu là chữa toolchain AgentKit |
| 2 | Repo public → token trong working tree là rủi ro rò rỉ thật | Trung bình | Repo private → hạ xuống P1, **vẫn phải xoay token** |
| 3 | Google Sheets ngoài phạm vi | Cao | task.md nêu rõ yêu cầu Sheets |
| 4 | Đường live là **CF Pages**, không phải Worker (`workers.dev/api/health` = 000) | Cao | Worker được deploy lại và có health endpoint |
| 5 | CI im vì push bằng `GITHUB_TOKEN` → bằng chứng local hợp lệ tạm thời | Trung bình | Lane C tìm ra nguyên nhân khác (workflow disabled, billing) |
| 6 | `CLAUDE.deploy.md` là chuẩn, mục VPS trong `CLAUDE.md` đã lỗi thời | Cao | Người dùng xác nhận VPS vẫn dùng |
| 7 | 4215/4215 test pass (từ plan trước) vẫn đúng | Thấp | Baseline Phase 0 cho kết quả khác → điều chỉnh ngưỡng, không đổi phương pháp so tập |

---

## 8. Tồn đọng (không chặn lần ship này)
- Kit `engineer/claude-code` hỏng → `ak` chỉ còn kit `core` rỗng; `~/.claude/commands/ak-ship.md` và `mk-ship.md` trỏ tới lệnh không tồn tại.
- Va chạm shim: `ck` → `/opt/homebrew/bin/ck` trong khi `ak` → `/Users/macbook/bin/ak`.
- Residual ClaudeKit trên home do AgentKit quản lý (`.ck.json`, `statusline.cjs`).
- 18 × `no-require-imports` cần chuyển ESM đúng cách → tách PR riêng nếu Lane A không hạ đủ ngưỡng một cách an toàn.
- Test fail cũ (nếu baseline có) → mở issue theo dõi riêng.
- `mk` harness load 0 skill — cần điều tra sau.
