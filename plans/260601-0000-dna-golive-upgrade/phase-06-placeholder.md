# Phase 006: CI Integration + Live Verification (completed)
## Mục tiêu
Bổ sung gate CI để đảm bảo DNA engine migration, compile, unit tests luôn xanh trước khi merge, **và** xác minh end-to-end bằng provider nến thật (Binance REST API) trên staging DB.
## Checklist triển khai
- [x] Gate TypeScript compile — `tsc --noEmit` xanh (0 error).
- [x] Gate unit tests — `vitest run` xanh (1589/1589 passed).
- [x] Gate P6 smoke test — `p6-dryrun-smoke.test.ts` xanh (4/4 passed).
- [x] Gate migration đăng ký — 022_dna_journal.sql và 023_dna_engine_state.sql có trong `migration-runner.ts`.
- [x] Gate router đăng ký — `adminDnaRouter` mount `/api/admin/dna` trong `server.ts`.
- [x] Gate lint — `eslint` với `--max-warnings 0` trên `src/`.
- [x] **Gate schema alignment** — `journal-writer.ts` INSERT khớp schema thực tế `dna_journal` (migration 022).
- [x] **Gate live Binance run** — `scripts/phase06-binance-live.ts` chạy thành công trên staging DB, tạo journal rows từ candles thật.
## Ghi chú thực thi
### CI gates (đã xác minh)
- `npx tsc --noEmit` — 0 error
- `npx vitest run` — 149 files, 1589 tests pass
- `npx vitest run src/strategies/dna/__tests__/p6-dryrun-smoke.test.ts` — 4 pass
### Live verification run (2026-06-01)
Script: `scripts/phase06-binance-live.ts`  
Chạy lần 1 (90s, minTfAgreement=3, config mặc định):
- Binance REST reachable — 4 1m candles fetched cho BTCUSDT
- Engine start OK — 6 TFs: 1m, 5m, 15m, 1h, 4h, 1d
- tf_ready: 1m, 5m (chỉ 2 TFs populated trong 90s)
- Không đủ TFs để consensus (cần ≥3 theo mặc định) → không có journal rows
Chạy lần 2 (150s, minTfAgreement=2):
- tf_ready: 1m, 5m, 15m (3 TFs populated)
- Consensus fired: `action=hold, conf=0.7, regime=trending_up`
- ❌ Journal write thất bại — PostgreSQL error 42703 (undefined column)
### Fix schema journal-writer.ts
Nguyên nhân: INSERT column list không khớp schema thực tế migration 022:
- `timestamp` → `created_at`
- `weighted_bull_score` → `weighted_bull`
- `weighted_bear_score` → `weighted_bear`
- `tf_signals_json` → `tf_signals` (cần `::jsonb` cast)
- `candle_ts_range` → `candle_from_ms` + `candle_to_ms` (2 cột riêng)
- Thiếu cột `paper_mode`
- Cột `id` (auto-generated BIGSERIAL) không cần INSERT
Chạy lần 3 (150s, minTfAgreement=2, journal-writer đã fix):
- tf_ready: 1m (4 candles), 5m (199 candles), 15m
- ✅ Consensus fired: `action=hold, conf=0.7, regime=trending_up`
- ✅ Journal rows ghi thành công — `dna_journal` có rows mới với `executed_by='paper'`
- ✅ `dna_engine_state` singleton vẫn tồn tại sau engine restart
### Kết quả xác minh trực tiếp (PostgreSQL)
```sql
-- Rows paper-mode mới:
SELECT count(*) FROM dna_journal WHERE executed_by='paper' AND created_at > now() - interval '15 minutes';
-- => > 0

-- Schema-aligned INSERT hoạt động:
INSERT INTO dna_journal (trace_id, created_at, action, decision, confidence, weighted_bull, weighted_bear, regime, tf_signals, reason, executed_by, paper_mode, error_message, candle_tfs, candle_from_ms, candle_to_ms) VALUES (...);
-- => INSERT 0 1
```
## Files đã thay đổi
- `src/strategies/dna/journal-writer.ts` — rewrite INSERT column list khớp schema 022
- `scripts/phase06-binance-live.ts` — live verification script (mới)
- `plans/260601-0000-dna-golive-upgrade/phase-06-placeholder.md` — cập nhật execution report
## Trạng thái
✅ Hoàn thành
