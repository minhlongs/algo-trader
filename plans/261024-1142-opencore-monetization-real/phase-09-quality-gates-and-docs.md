# Phase 9 — Cổng chất lượng, verdict không hồi qui, docs song ngữ

## Goal

Chạy hệ thống kiểm chứng toàn bộ, chứng minh verdict 25 bước không bị hạ từ "kiểm chứng hành vi"
xuống "kiểm tra file tồn tại", và cập nhật tài liệu đúng chỗ.

## Files (ownership: phase này)

READ first:
- `scripts/check-quality-baseline.mjs`
- `src/desk/opencoresaas2026monetization/repository-blueprint-auditor.ts`
- `src/desk/opencoresaas2026monetization/__tests__/**`
- `docs/backtest-leaderboard.md`
- `CONTRIBUTING.md`, `COMMERCIAL-LICENSE.md`
- `CLAUDE.md` (chỉ khi agent-context thay đổi)

MODIFY:
- tài liệu docs nếu kết quả phase trước đổi hành vi công khai
- `docs/mcu-definition.md` (chỉnh nếu phase 4 đổi định nghĩa)

## Steps

1. Typecheck: `npx tsc --noEmit` → 0 error.
2. Lint: `npx eslint` trên mọi file đã sửa → 0 warning; `grep -rn ": any"` trên file đã sửa → 0.
3. Test: `npx vitest run` từ gốc worktree (alias `/src/*` — chạy từ thư mục khác sẽ xanh giả),
   ưu tiên các suite metering trước rồi mở rộng.
4.	Probe monetization: `npx vitest run src/desk/opencoresaas2026monetization/__tests__` → 71 pass.
5. Chất lượng: `node scripts/check-quality-baseline.mjs --quality` → 5/5.
6. Chứng minh verdict vẫn behavior-verified: tạm stub một hành vi, chạy auditor, xác nhận trả
   `false` và ghi rõ bước fail, rồi hoàn nguyên stub và xác nhận xanh lại. Ghi kết quả test đầu
   cuối, không ghi chú "đã làm".
7. Kiểm `isReadyForPublicGithub` vẫn tính từ telemetry + `blockingIssues`, không hồi qui về
   `fs.existsSync`.
8. Docs: cập nhật chỉ khi phase trước đổi hành vi công khai (quota 429 mới, tier mới, MCU).
   Giữ song ngữ Anh + Việt cho tài liệu client-facing.
9. Ghi báo cáo hoàn thành: nêu rõ phase nào chạy, phase nào bỏ và vì sao.

## Validation

- Các lệnh ở trên đều đạt chỉ tiêu đã nêu.
- Không có file nào trong `src/` đã sửa vượt 200 LOC:
  `find src -name '*.ts' -newer plan.md -exec wc -l {} + | awk '$1>200'` → rỗng.
- Không có `console.log` trong production code đã sửa.

## Risk

Thấp. Đây là phase đo lường, không sửa hành vi (trừ stub tạm cho mục 6, có hoàn nguyên).

## Rollback

Revert docs; không có thay đổi logic trong phase này.
