---
agent: code-reviewer
date: 2026-04-16
slug: phase-01-02-04
scope: commits 39fc54b + 1659c49 + d4576c6 on main
verdict: CONDITIONAL
---

# Code Review — Phases 01 + 02 + 04 (chinh-danh-a16z-dual-layer)

## Scope
- Commits: `39fc54b` (Phase 01 manifesto+plan), `1659c49` (Phase 02 landing), `d4576c6` (Phase 04 cadence)
- Files reviewed: 17 (7 new .tsx, 3 scripts, 3 docs, 1 plist, 1 json, 1 App.tsx patch, 1 package.json)
- LOC new: ~1,990
- Ownership: clean — Phase 02 = `dashboard/**` + `build-paper-stats.ts`; Phase 04 = `generate-*.ts` + `launchd/*` + `docs/{social,build-in-public}`. No crossover.

## Overall Assessment
Diff ngắn gọn, kỷ luật chính danh tốt. Polar-safe audit PASS 100% on visible copy. Không secrets, không Vercel. Commit messages conventional. 2 script file > 200 LOC và 1 SQL-interpolation pattern cần rà soát — đều không chặn phase 01/02/04 ship, nhưng cần fix trước khi Phase 03/D1 sync.

## Blocker Scorecard

| # | Check | Score | Note |
|---|---|---|---|
| 1 | Polar-unsafe in visible text | 10/10 | 0 matches in manifesto.md, paper-stats.json, landing.tsx, hero-solo-quant.tsx, manifesto.tsx, methodology.tsx, paper-stats-card.tsx, docs/social-accounts.md, docs/build-in-public-log.md. Hits trong `dashboard/src/**` chỉ ở `/* Polar-safe */` comments và các file *ngoài* scope 3 commit (analytics/setup/pricing pages). |
| 2 | Secrets committed | 10/10 | 0 keys/tokens/seed phrases. `docs/social-accounts.md` explicit placeholder-only + warning footer. |
| 3 | Vercel references | 10/10 | 0 matches trong scope. `dashboard/package.json` dùng `wrangler pages deploy` cho cả staging + production. |
| 4 | TS syntax errors | 9/10 | `tsc --noEmit` báo đúng 2 lỗi đã biết: `react-markdown` + `remark-gfm` not installed (expected — phụ thuộc được khai báo trong `package.json` nhưng chưa `pnpm install`). Không có lỗi khác. |
| 5 | Unsafe markdown rendering | 10/10 | `MarkdownViewer` KHÔNG truyền `rehype-raw`; comment nội dòng ghi rõ "raw HTML is stripped". Manifesto.md 0 raw HTML tag. XSS surface = 0. |
| 6 | Ownership crossover P02↔P04 | 10/10 | Không overlap. |
| 7 | File > 200 LOC | 6/10 | 2 vi phạm: `scripts/generate-weekly-draft.ts` = 216 LOC, `scripts/generate-monthly-milestone.ts` = 297 LOC. Mỗi file có 3 concerns tách được (date-utils, sqlite-io, template). |

**Overall blocker score: 9.3/10** — không blocker nào FAIL.

## Blockers — NONE

## Non-Blockers (priority order)

### High
1. **SQL string interpolation in `generate-weekly-draft.ts:47` + `generate-monthly-milestone.ts:42`** — `${sinceIso}` inlined vào shell `sqlite3 "…"` qua `execSync`. Input là `Date.toISOString()` nên rủi ro LOW hiện tại; nhưng pattern không an toàn nếu refactor để nhận CLI args. Khuyến nghị: dùng `sqlite3 -cmd` hoặc switch sang `better-sqlite3` khi Phase 03 đụng tới. Không chặn ship.
2. **`fetchGitStats` command-substitution trong template string** (`generate-monthly-milestone.ts:139-141`) — nested `$(git rev-list ... --before="${since.toISOString()}")`. ISO string luôn safe, nhưng comment rõ ràng khi người khác sửa.
3. **File size >200 LOC** — theo `development-rules.md` §File Size: generate-monthly-milestone.ts (297) nên tách `{date-utils, sqlite-queries, git-queries, template-builder}`. Cân nhắc fix trước khi Phase 03 thêm D1 logic.

### Medium
4. **`build-paper-stats.ts` dùng dynamic require('better-sqlite3')** với `// eslint-disable-next-line`. Acceptable vì dep là optional; comment giải thích rõ. OK.
5. **Landing `<main>` missing** — `landing.tsx` wrap toàn bộ trong `<div>` thay vì `<main>`. `ManifestoPage` có `<main>`. Inconsistent landmark; screen-reader bỏ lỡ main content.
6. **Placeholder `actionable_pct` = 55 trong `build-paper-stats.ts:39`** trùng với Phase-2 gate threshold (55% hit rate). Dễ gây confuse "actionable share" vs "win rate". Đổi placeholder = 48 hoặc 50 tránh số magic collision. Manifesto nói 150 trades / 14.6–25.3% edge — placeholder `edge_avg_pct: 18.3` OK (midpoint).
7. **`methodology.tsx` hard-code GitHub URL ở 2 nơi** (hero-solo-quant.tsx có cùng const `DEFAULT_METHODOLOGY_URL`). DRY miss — extract thành shared const `dashboard/src/constants/methodology-url.ts`.
8. **`PublicNavbar` + `Footer` chưa kiểm toán Polar-safe riêng** — landing/manifesto/methodology import 2 component này, nếu copy thay đổi sẽ affect all public pages. Khuyến nghị: test audit chạy CI quét visible text trong cả `dashboard/src/components/{public-navbar,footer}.tsx`.

### Low
9. `\$${stats.weekPnl}` trong template literal — `\$` không cần escape trong JS template strings (không phải `${}`). Chỉ làm hại readability. Functional OK.
10. `build-paper-stats.ts` `loadBetterSqlite(): unknown | null` + cast về constructor — acceptable; cân nhắc declare interface `BetterSqliteModule` cho type-safe.
11. `paper-stats-card.tsx` state `stats` init = `PLACEHOLDER` (0s) — flicker zero-values khi fetch chưa resolve. Thêm `loading` state hoặc server-inline JSON via Vite plugin.
12. `methodology.tsx` redirect bằng `window.location.replace` trong `useEffect` — SSR-safe (dashboard SPA), nhưng nếu bật SSR/SSG sau sẽ hydrate mismatch. OK cho hiện tại.
13. `config/launchd/weekly-draft.plist` user path = `/Users/macbook/` — đúng target M1 Max (comment line 7 clarify). Reminder: M1 Max user thực tế cần verify bằng SSH trước install.
14. `docs/build-in-public-log.md` + `docs/social-accounts.md` dùng table heading `| — |` cho unfilled — dễ đọc; nhưng HN mentions Markdown table render nên OK.

## Edge Cases Found (Scouting)
- **Manifesto served từ `/public/manifesto.md` copy** (dashboard package.json `prebuild:manifesto`): nếu `docs/manifesto.md` update mà build không chạy, viewer serve stale. Phase 03 nên move to Vite plugin hoặc fetch-from-repo-URL.
- **`cache: 'no-cache'` trong MarkdownViewer + PaperStatsCard**: buộc CF Pages fetch origin mỗi request → edge cache miss. Acceptable cho low-traffic bootstrap, nhưng revisit khi Phase 03 attach D1.
- **`fetch('/paper-stats.json')` không check Content-Type** — nếu CF Pages trả HTML 404 page JSON.parse sẽ throw "Unexpected token <"; hiện handler đã catch nên không crash UI. OK.
- **Manifesto frontmatter `d3_live_pnl_from: "$500 Phase 2"`** vs manifesto body Chapter IV "Initial live capital: $500". Consistent. Pass.
- **Hero text "autonomous agent stack"** — "autonomous agent" đã confirm Polar-safe theo `feedback_polar_ai_rejection` memory (không chứa "AI" naked). Pass.

## Positive Observations
- Polar-safe discipline xuyên suốt: comments, JSDoc, và visible copy đều tách biệt rõ.
- `MarkdownViewer` security-by-default — rehype-raw off, comment inline lý do.
- Manifesto Chapter V điều 4 (refusing "AI" term) coherent với codebase audit.
- Plan/phase files comply với `documentation-management.md` structure.
- `paper-stats-card` có error fallback + no-crash khi JSON fetch fail.
- Commit messages clean conventional, zero AI attribution.
- Ownership phân tách sạch giữa 2 feat commit — dễ revert riêng.

## Recommended Actions
1. **Before Phase 03 kickoff**: modularize `generate-monthly-milestone.ts` (297→<200 LOC) theo `{date-utils,sqlite-io,git-io,template}`.
2. **Before Phase 03 kickoff**: switch SQL path sang `better-sqlite3` prepared statements (khớp `build-paper-stats.ts`) — tránh drift 2 patterns.
3. **Quick wins now**: extract `DEFAULT_METHODOLOGY_URL` shared const; wrap landing in `<main>`; change `actionable_pct` placeholder 55→50.
4. **Install deps**: `cd dashboard && pnpm install` để `tsc --noEmit` về 0 errors; commit lockfile nếu chưa.
5. **CI idea**: add grep regex blocker cho `\bAI\b|artificial intelligence|wellness|therapeutic|medical|fitness` trên `dashboard/public/**` + `docs/manifesto.md` tránh regress.

## Metrics
- Polar-safe hits in scope visible text: **0**
- Secrets found: **0**
- Vercel references: **0**
- TS errors in scope: **2** (both are the known un-installed deps — not syntax)
- Files > 200 LOC: **2 / 13 new code files** (both scripts)
- Commit message compliance: **3/3**
- Accessibility misses: 1 (landing `<main>`)

## Verdict: **CONDITIONAL PASS**

Ship Phase 01+02+04 as-is. Conditions before Phase 03 merges:
- Install dashboard deps so `tsc` = 0 errors.
- Modularize the 2 oversized scripts OR document exception in phase-03 plan.

## Unresolved Questions
1. `better-sqlite3` nên thêm vào root `package.json` as optionalDependency không? Hiện dynamic-require fallback, nhưng dev thấy `pnpm install` sạch hơn nếu khai báo.
2. Phase 03 sẽ reuse `MarkdownViewer` cho BINH_PHAP_TRADING.md không? Nếu có, `methodology.tsx` redirect nên chuyển thành in-app render.
3. Ai chịu trách nhiệm verify user path `/Users/macbook/` trên M1 Max thực tế trước install plist?
4. `actionable_pct = 55` có ý nghĩa biz riêng (khác win rate)? Xin clarify trước khi propose đổi placeholder.
