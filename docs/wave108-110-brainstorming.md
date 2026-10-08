# Báo cáo Brainstorming: Wave 108-110 (Bates, Almgren-Chriss & Li Gaussian Copula)

## Mục tiêu (Product Outcome)
Tiếp tục chuỗi mở rộng Institutional Quant OS khốc liệt với 3 module kinh điển.
1. **Desk 108: Bates Model (1996) - Kho SVJ (Stochastic Volatility with Jumps)**: Kết hợp hoàn hảo giữa mô hình biến động ngẫu nhiên Heston (1993) và khuếch tán nhảy Merton (1976). Rất mạnh trong việc cấu trúc giá Option vượt qua khủng hoảng Flash Crash. Sử dụng CF (Characteristic Function) tích phân hội.
2. **Desk 109: Almgren-Chriss Optimal Execution (2000)** - Công cụ lập lịch khớp lệnh tối ưu (Execution Trajectory). Cân bằng chuẩn xác giữa rủi ro trượt giá (Market Impact) và rủi ro thời gian (Variance/Timing risk) để thanh lý một danh mục lớn khổng lồ mà không phá hủy sổ lệnh (Orderbook).
3. **Desk 110: Li Gaussian Copula (2000) - Rủi ro tín dụng danh mục**: Mô hình định giá nổi tiếng (từng liên quan đến khủng hoảng Subprime 2008), dùng Copula phi chuẩn hóa (khai triển đa hạt nhân của luật sinh tổn thất) để tính tương quan vỡ nợ (Default Correlation) giữa nhiều trái phiếu/tài sản trong CDO.

## Ràng buộc & Tiêu chí nghiệm thu (Constraints & AC)
- **100% TypeScript**, zero `any`, không thư viện, zero dependencies.
- **Rule khắt khe**: < 200 LOC per file, 100% test coverage zero-mock.
- Engine Almgren-Chriss xuất ra Trajectory (chuỗi array số lượng cổ phiếu cần xả qua n time bins).
- Engine Copula dùng hàm ánh xạ xác suất Inverse CDF chuẩn (Muller-Box hoặc Horner method rút gọn).

## Non-goals
- Không dính GUI/DB.
- Không tính CDO Tranche phức tạp, Desk 110 chỉ dừng ở việc tính xác suất vỡ nợ đồng thời (Joint Default Probability) của một rổ 2-3 tài sản nòng cốt để chứng minh tính hiệu quả của tương quan Copula.

## Các bước triển khai (Workflow)
- Phase 1: Tạo Interface. Copula Inverse CDF / Tính ma trận hiệp phương sai.
- Phase 2: Code engine Almgren-Chriss (giải phương trình vi phân sai phân hữu hạn LQR).
- Phase 3: Code Bates (Kế thừa nền tảng Heston CF + thành phần Poisson Jumps).
- Phase 4: Unit Test Suite.
