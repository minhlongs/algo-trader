# Plan: Cheetahclaws-DNA Go-Live Upgrade

Kế hoạch nâng cấp go-live cho Cheetahclaws-DNA engine — đưa từ "đã code, chưa chạy" sang production-ready, có persistence, paper trading, và test coverage. Áp dụng kiến trúc agentic theo revfactory/harness.

## Lộ trình giai đoạn (Phases)

> **Harness Convention**: mỗi phase có file riêng trong cùng thư mục.
> Cập nhật trạng thái ở đây sau mỗi phase hoàn thành.

| Giai đoạn | Nội dung công việc | Trạng thái |
|-----------|---------------------|-----------|
| Phase 01 | **Persist Orchestrator State**: tạo state manager lưu/load `_lastTfSignals`, `_lastRegime`, `_lastConsensus` từ DB; engine restart không mất state | ✅ Hoàn thành |
| Phase 02 | **Unit Tests cho DnaEngine**: test orchestrator với mock CandleProvider; coverage 80%+ | ✅ Hoàn thành |
| Phase 03 | **Paper Trading Execution Layer**: subscriber nhận `consensus_computed` event → gửi lệnh paper vào bảng `paper_trades` | ✅ Hoàn thành |
| Phase 04 | **Admin Endpoint DNA Status**: POST /admin/dna/status, /admin/dna/start, /admin/dna/stop, /admin/dna/config | ✅ Hoàn thành |
| Phase 05 | **Migration + Seed**: chạy 022_dna_journal.sql; seed config mặc định; backfill nếu có data cũ | ✅ Hoàn thành |
| Phase 06 | **CI Integration**: test + lint + migration check trong CI pipeline | ✅ Hoàn thành |

## Phụ lục

- `phase-01-state-persistence.md`
- `phase-02-unit-tests.md`
- `phase-03-paper-execution.md`
- `phase-04-admin-endpoints.md`
- `phase-05-migration-seed.md`
- `phase-06-ci-integration.md`

