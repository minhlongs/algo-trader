# Phase 5 — Leaderboard sinh từ CSV + CI guard

## Goal

`docs/backtest-leaderboard.md` (git-tracked, công khai) quảng cáo Sharpe 3.82 / thắng 88.5% cho
rank 1, trong khi `reports/backtest-results.csv` — artifact mà API thật đang đọc — chỉ có tổng
87 lệnh, `bollinger-squeeze` Sharpe 19.52 trên đúng 7 lệnh với profit factor `Infinity`, ba
chiến lược Sharpe âm, và 22/30 dòng có 0 lệnh vẫn `status: OK`.

May mắn là repo **đã có** `src/platform/api/routes/leaderboard-builder.ts`, đã đọc đúng CSV, đã
xử lý `Infinity`, và được API thật tiêu thụ qua `leaderboard-routes.ts:43`. Nên phase này là
nối vào builder sẵn có, không phải viết parser mới.

## Files (ownership: phase này)

READ first:
- `src/platform/api/routes/leaderboard-builder.ts`
- `src/platform/api/routes/leaderboard-routes.ts`
- `reports/backtest-results.csv`
- `docs/backtest-leaderboard.md`
- `scripts/check-quality-baseline.mjs` (mẫu CI guard sẵn có, đang pass 5/5)

MODIFY:
- `src/platform/api/routes/leaderboard-builder.ts` — xuất thêm khả năng render dạng văn bản/markdown
- `docs/backtest-leaderboard.md` — trở thành file sinh ra

CREATE:
- `scripts/generate-leaderboard.mjs`
- `scripts/__tests__/generate-leaderboard.test.ts`

DO NOT TOUCH:
- `src/platform/api/routes/open-core-routes.ts` (phase 5b, quyền khác)
- `reports/backtest-results.csv` (đó là dữ liệu)

## Steps

1. Script đọc CSV qua chính parser đã có (đừng nhân đạo một parser thứ hai).
2. Render markdown có: rank, chiến lược, Sharpe, max drawdown, win rate, **sample size
   (`total_trades`)**, và giá trị tồn tại được. Mọi số phải truy được về một dòng CSV.
3. Dòng `total_trades = 0` hiển thị là "không đủ dữ liệu" — **không** gán Sharpe hay rank.
4. Giữ song ngữ (Anh + Việt) như file hiện tại; giữ header platform, walk-forward, Monte Carlo
   chỉ khi nó đúng với dữ liệu (nếu không, bỏ chứ đừng giữ khẩu hiệu không có nguồn).
5. Đánh dấu rõ "tài liệu được sinh — đừng sửa tay" ở đầu file.
6. CI guard: script fail nếu `docs/backtest-leaderboard.md` khác output của generator.
   Thêm vào `scripts/check-quality-baseline.mjs` hoặc một check script riêng được npm script gọi.
7. Dọn chỉ dẫn nộp bài marketplace sai (`docs/backtest-leaderboard.md` đang trỏ sang
   `src/desk/strategies/marketplace.ts` — kho RAM 86 dòng). Trỏ sang `src/platform/marketplace/`
   hoặc bỏ chỉ dẫn đệ trình.

## Validation

- `node scripts/generate-leaderboard.mjs` → exit 0
- `git diff --exit-code docs/backtest-leaderboard.md` → exit 0 (diff rỗng)
- Sửa một ô trong CSV → chạy lại → doc đổi, và CI guard báo fail khi không chạy generator
- `grep -c "Infinity" docs/backtest-leaderboard.md` → 0 (hiển thị "n/a — profit factor vô hạn
  trên mẫu quá nhỏ", không in `Infinity`)
- `grep "3.82\|88.5\|94.2" docs/backtest-leaderboard.md` → 0 hit

## Risk

Bảng trung thực sẽ **nhỏ và kém ấn tượng hơn nhiều**: 22/30 chiến lược không có lệnh, Sharpe âm
có thật. Đó là hệ quả đúng của việc công bố sự thật, nhưng nó cắt tài sản marketing — founder cần
biết trước, và PR phải nói rõ điều này.

## Rollback

`git checkout docs/backtest-leaderboard.md` và xoá script. Không ảnh hưởng code.
