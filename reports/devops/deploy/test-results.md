# Smoke Test & Verification Results

Dự án: **Algo-Trader RaaS Platform**  
Thời gian kiểm tra: **2026-05-30T02:50:00Z**  

---

## 1. Kết quả chạy Test Suite cục bộ
Chạy toàn bộ unit & integration tests của hệ thống:
```bash
pnpm test
```
*   **Số lượng file test**: 137 files.
*   **Tổng số test cases**: 1506 tests.
*   **Tỷ lệ thành công**: **100% PASS** (0 test thất bại).
*   **Typecheck**: `pnpm typecheck` thành công không có lỗi cú pháp/kiểu dữ liệu.

## 2. Smoke Test Health Endpoint
Kiểm tra API trực tiếp từ host thông qua cổng `4000`:
```bash
curl -s http://localhost:4000/health
```
*   **HTTP Status**: `200 OK`
*   **Trạng thái trả về**: `"status":"healthy"`
*   **Trạng thái Redis**: `"ok"`
*   **Trạng thái Trading Engine**: `"ok"`
*   **Uptime**: Hoạt động liên tục ổn định.

## 3. Nhật ký Container (Container Logs Verification)
Kiểm tra log của container ứng dụng `algo-trade`:
```bash
docker logs algo-trade
```
*   [ApiServer] Listening on port 3000 (nội bộ container).
*   [App] AlgoTrade API running — port=3000 env=production.
*   [Redis] Connected thành công tới container Redis qua network `algo-net`.
*   Không có bất kỳ cảnh báo lỗi hoặc crash-loop nào được ghi nhận.

## 4. Pre-heat GPU/LLM Models
*   Tiến trình chạy nền `warm-models.sh` đã kích hoạt thành công.
*   Ollama local model `deepseek-r1:32b` tại `http://127.0.0.1:11434/v1` phản hồi tốt và đã tải trọng số vào bộ nhớ GPU để tối ưu hóa độ trễ cho lần truy vấn đầu tiên.
