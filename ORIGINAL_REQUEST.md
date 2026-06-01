# Original User Request

## Initial Request — 2026-05-30T04:50:01-07:00

Dự án triển khai khung bảo mật và tuân thủ (Compliance & Security Hardening Framework) cho hệ thống Algo-Trader RaaS Dashboard theo Roadmap Phase 35.

Working directory: /Users/macbook/algo-trader
Integrity mode: development

## Requirements

### R1. Multi-Tenant Audit Logging
Xây dựng một hệ thống ghi nhật ký kiểm toán (audit logs) bất biến cho toàn bộ các hoạt động giao dịch (trades), đặt lệnh (orders) và cấu hình hệ thống. Dữ liệu audit logs phải được cô lập hoàn toàn giữa các tenant (`tenantId`), lưu trữ an sau và hỗ trợ truy vấn nhanh qua API.

### R2. Redis-Based Distributed Rate Limiter
Nâng cấp hệ thống giới hạn tần suất (rate limiting) từ cơ chế in-memory hiện tại lên Redis-based sliding window rate limiter để hỗ trợ môi trường cụm phân tán (Redis Cluster). Cho phép cấu hình các mức giới hạn (rate limits) khác nhau tùy thuộc vào pricing tier của tenant (FREE, PRO, ENTERPRISE).

### R3. AES-256 Encryption at Rest
Tích hợp cơ chế mã hóa dữ liệu nhạy cảm ở chế độ nghỉ (Encryption at Rest) sử dụng thuật toán AES-256-GCM. Toàn bộ API keys, API secrets và thông tin xác thực sàn giao dịch của các tenant khi lưu xuống Database phải được mã hóa tự động và chỉ được giải mã khi cần thiết tại runtime.

## Acceptance Criteria

### Security & Compliance
- Dữ liệu nhạy cảm (API Keys, secrets) được lưu trữ dưới dạng mã hóa AES-256-GCM trong Database.
- Audit logs ghi nhận đầy đủ IP, user agent, timestamp, hành động, và tenantId, đồng thời được cô lập nghiêm ngặt giữa các tenant.
- Redis Rate Limiter chặn chính xác các requests vượt ngưỡng cấu hình theo tier của tenant và trả về mã lỗi HTTP 429.

### Quality & Tests
- Toàn bộ test suite hiện tại và các test mới viết thêm duy trì trạng thái PASS 100%.
- 0 lỗi biên dịch TypeScript (`npx tsc --noEmit` ở root và `dashboard` thành công).
- Không sử dụng kiểu dữ liệu `any` hoặc `@ts-ignore` trong mã nguồn mới.
