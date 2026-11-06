# Báo cáo Phase: Short PnL & Fee Honesty

## Kết quả
Status: DONE
- `computeClose` định tuyến mọi fill "ngược chiều" với vị thế đang mở qua một đường
  close thống nhất. BUY đóng short (và SELL đóng long) nay cùng một luật:
  gross PnL, phí taker cả hai chân, gas.
- Commit: `8d52e2e6 fix(backtesting): realize PnL and venue costs on short round trips`
  (3 file, +238/-67). Chưa push, chưa merge.

## Test đã đảo ngược
1. `tests/unit/desk/backtesting/backtest-order-manager.test.ts:175` —
   "returns null pnl from BUY even when closing short (implementation behavior)".
   Lỗi chính của task: BUY đóng short bị ghi nhận là mở rộng vị thế nên không
   bao giờ chốt PnL. Nay: BUY đóng short chốt net PnL = 9.80.
2. `tests/unit/desk/backtesting/backtest-order-manager.test.ts:239-251` —
   "updates short position via SELL when existing short present". Bản cũ khẳng định
   vị thế bị THAY (size về lại -100) chứ không nối dài. Đây là bug thứ hai trong cùng
   nhánh: một SELL thứ hai trên short 100 @ 0.60 làm mất 100 share đã bán. Nay khẳng
   định nối dài: size -200, avgPrice 0.65 (bình quân theo khối lượng), cả hai fill
   entry PnL = null.
3. `around 419` — đã giữ nguyên phần "extra 100 is ignored" theo đúng yêu cầu
   (không sửa bug SELL 200 đóng long 100). Đây vẫn là một bug thật, chỉ chưa thuộc
   scope này; ghi chú lại ở mục "Điểm chưa xử lý".
4. `tests/unit/desk/backtesting/backtest-order-manager.test.ts` (block "Short C") —
   "Buy 100 @ 0.75 (close - BUY returns null pnl)". Đổi lại mong đợi equity cho
   đúng hành vi: short gross = 100 * (0.70 - 0.75) = -$5.00, trừ taker trên
   notional $75 (-$0.15), trừ gas 2 fill (-$0.10) => net -$5.25.

Không có assertion nào bị làm yếu: mỗi test vẫn so sánh số chính xác.

## Số liệu test
- Trước: `npx vitest run src/desk/backtesting tests/unit/desk/backtesting`
  => 8 file / **149 passed, 0 failed**.
- Sau: 8 file / **157 passed, 0 failed** (thêm 8 test short mới).
- Full `npx vitest run src/desk`: **2197 passed / 11 skipped, 0 failures**
  (đúng baseline dispatch; +2 test mới tôi thêm ở file fee-application
  đưa lên 2199 passed / 11 skipped ở lần chạy cuối cùng).
- tsc --noEmit: exit 0.
- eslint 3 file: 0 error.
- LOC: `backtest-order-manager.ts` 188, `backtest-fee-application.test.ts` 221,
  `backtest-order-manager.test.ts` 536.

## PnL đã kiểm chứng
- Short round trip (SELL 100 @ 0.60, BUY 100 @ 0.50):
  gross +10.00, fee 0.10, gas 0.10, **net +9.80**. Fill thứ hai trả về `pnl`
  kiểu số, `getFillCosts()` có 1 phần tử, equity 10000 -> 10009.80.
- Short hai entry (SELL 100 @ 0.50, SELL 100 @ 0.70, BUY 200 @ 0.60):
  avg entry 0.60 => gross = -0 (float), taker 0.24 trên notional $120,
  gas 3 fill = 0.15 => **net -0.39**. Gas entry chỉ chốt MỘT lần trên fill BUY
  cuối, dù có hai fill vào.

## File đã sửa
- `/Users/macbook/algo-trader/.claude/worktrees/fix-short-pnl-honesty/src/desk/backtesting/backtest-order-manager.ts`
- `/Users/macbook/algo-trader/.claude/worktrees/fix-short-pnl-honesty/src/desk/backtesting/__tests__/backtest-fee-application.test.ts`
- `/Users/macbook/algo-trader/.claude/worktrees/fix-short-pnl-honesty/tests/unit/desk/backtesting/backtest-order-manager.test.ts`

Không chạm `backtest-fee-application.ts`, không đổi `takerFeeBps` / `gasCostUsd`,
không đụng `src/shared/backtesting/*`, `src/desk/polymarket/*`, `src/desk/execution/*`,
`reports/backtest-results.csv`, `docs/backtest-leaderboard.md`.

## Điểm tôi không làm theo brief một cách chặt chẽ
1. Tôi refactor `computeClose` gộp hai nhánh long/short thành `computeClose` +
   `settleClose` dùng chung một quy ước dấu. Bản sửa tối thiểu (thêm if short vào
   nhánh BUY) sẽ đưa file lên **208 LOC**, vượt trần 200 của repo. Gộp lại cho
   file **188 LOC** và xóa luôn phần nhánh short trùng lặp. Hành vi long giữ
   nguyên đúng số: 149 test cũ vẫn xanh, các assertion long dùng đúng con số
   trước đây (9.78, 9.83, -10.2, 10004.79, ...).
2. Trong `settleClose` tôi vẫn giữ khung `gasFills = 1 + (chargeEntryGas ?
   entryFills : 0)`, đúng yêu cầu, không đổi nghĩa model gas.

## Điểm chưa xử lý (cần người điều phối quyết)
- SELL 200 trên long 100: phần dư 100 bị bỏ qua hoàn toàn. Test ở dòng ~265 vẫn
  khẳng định hành vi đó theo brief. Có thể cần một phase riêng.
- SELL trên short hiện nối dài (đúng theo yêu cầu) nhưng **chỉ ghi nhận PnL khi
  BUY đóng hết**; một short bị nới rộng rồi bị đóng theo nhiều lần vẫn đúng, đã
  có test bao phủ.

## Câu hỏi
1. `equityCurve` không bao giờ được `BacktestOrderManager` ghi vào (luôn rỗng),
  nên `computeMetrics` trong `backtest-fee-application.test.ts` phải fallback.
  Không thuộc scope này, nhưng có thể muốn một phase riêng để nối equity curve.
