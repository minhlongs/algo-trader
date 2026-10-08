# Báo cáo Brainstorming: Wave 102-104 (Jarrow-Turnbull, Corwin-Schultz & Vanna-Volga)

## Mục tiêu (Product Outcome)
Xây dựng 3 core quantitative engines phiên bản Enterprise, không sử dụng thư viện toán học bên ngoài, đáp ứng độ phủ test 100%, dưới 200 dòng code (LOC) mỗi file.
1. **Desk 102: Jarrow-Turnbull Credit Risk (1995)** - Mô hình rủi ro tín dụng dạng rút gọn (Reduced-form), định giá trái phiếu có rủi ro vỡ nợ (Defaultable bond) sử dụng cường độ vỡ nợ (Hazard rate) và tỷ lệ thu hồi (Recovery rate).
2. **Desk 103: Corwin-Schultz Bid-Ask Proxy (2012)** - Ước lượng mức chênh lệch giá mua-bán (Bid-Ask spread) trên thị trường OTC/Dark Pool chỉ dựa vào giá Đỉnh (High) và giá Đáy (Low) hàng ngày (tối ưu tính thanh khoản khi không có order book depth).
3. **Desk 104: Vanna-Volga Pricing (2006)** - Kỹ thuật nội suy đường cong Volatility Smile nổi tiếng trong thị trường Ngoại hối (FX Options), tái tạo giá trị danh mục thông qua Risk Reversal (RR) và Butterfly (BF) dựa trên 3 greeks bậc hai: Vanna ($d\Delta/d\sigma$) và Volga ($dV/d\sigma$).

## Ràng buộc & Tiêu chí nghiệm thu (Constraints & AC)
- **100% TypeScript**, zero `any`, zero-dependency.
- **Rules**: Zero TSLint/TS error, < 200 LOC per file.
- **Testing**: 100% coverage, zero mock, Vitest.
- **Thuật toán chính xác**: Khớp với các 논문/textbook references.

## Non-goals
- Không tích hợp GUI hay database.
- Không dùng Monte Carlo cho Vanna-Volga (dùng analytic system of equations).

## Các bước triển khai (Workflow)
- Phase 1: Tạo Interface & config.
- Phase 2: Code 3 Engine (Credit, Liquidity, FX Smile).
- Phase 3: Helper cho Vanna-Volga (Black-Scholes Vanilla).
- Phase 4: Unit Test Suite.
