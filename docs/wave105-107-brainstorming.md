# Báo cáo Brainstorming: Wave 105-107 (Heston, Sabr & Extended Vasicek (Hull-White))

## Mục tiêu (Product Outcome)
Xây dựng 3 core quantitative engines phiên bản tối ưu, không thư viện toán học, đáp ứng độ phủ 100% test, nhỏ hơn 200 LOC per file.
1. **Desk 105: Heston Stochastic Volatility (1993)** - Mô hình biến động ngẫu nhiên với phương trình vi phân ngẫu nhiên (SDE) cho giá ($dS$) và phương sai ($dV$), cho phép tính giá quyền chọn kiểu châu Âu thông qua khai triển chuỗi / tích phân Fourier đảo ngược.
2. **Desk 106: SABR Volatility Model (2002)** - Stochastic Alpha, Beta, Rho. Mô hình chuẩn công nghiệp cực nhanh của Hagan et al., cung cấp công thức tiệm cận trực tiếp (closed-form asymptotic) để thiết lập đường smile/skew cho Lãi suất và FX mà không cần dùng đến MC.
3. **Desk 107: Hull-White (Extended Vasicek, 1990)** - Mô hình lãi suất ngắn hạn (Short-rate) một nhân tố với trung bình đảo hướng thời gian thực (time-dependent mean reversion level), cho phép khớp nối khít hoàn toàn (perfect fit) với cấu trúc đường cong lợi suất tĩnh (Yield Curve) thị trường ngày số không (T=0).

## Ràng buộc & Tiêu chí nghiệm thu (Constraints & AC)
- **100% TypeScript**, zero `any`, zero-dependency.
- Khớp với tham chiếu toán học (Heston characteristic function, SABR density, HW analytical bond).
- Dưới 200 dòng code mỗi file, compile pass.
- Giữ vững testing zero-mock.

## Non-goals
- Engine Heston sẽ bỏ qua Fast Fourier Transform (FFT) cồng kềnh (vì bị giới hạn LOC), thay vào đó nội suy cận số (numerical integration) sử dụng Simson's rule hoặc Gauss-Laguerre trên Characteristic Function căn bản.
- Calibration (hiệu chỉnh tham số) cho SABR sẽ không xây tự động (để qua pipeline desk riêng), chỉ cấu hình hàm Volatility `calculateImpliedVol`.

## Các bước triển khai (Workflow)
- Phase 1: SABR Asymptotic Formula (vì ngắn, dễ pass < 200 LOC).
- Phase 2: Hull-White analytical Zero-Coupon Bond & European Option trên Zero-Coupon.
- Phase 3: Heston Characteristic Function + Numerical integral.
- Phase 4: Unit Test Suite.
