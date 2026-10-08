# Kế hoạch Triển khai Wave 81-83 Trilogy

## I. Mục tiêu & Phạm vi
Triển khai bộ ba định giá và vi cấu trúc thị trường định chế thế hệ mới:
1. **Desk 81 (Black-Derman-Toy 1990 1-Factor Tree)**: `BdtEngine` calibrate short rate lognormal $r_{i,j} = u_i \cdot e^{2 j \sigma_i \sqrt{\Delta t}}$ qua Arrow-Debreu state prices $Q_{i,j}$, định giá zero coupon bond và European/Bermudan callable bond option.
2. **Desk 82 (Huang-Stoll 1997 Microstructure 3-Way Spread)**: `HuangStollEngine` phân rã spread 3 chiều: Adverse Selection $\alpha$, Inventory Holding $\beta$, Order Processing $\gamma = 1 - \alpha - \beta$, tính xác suất duy trì dòng lệnh $\pi$.
3. **Desk 83 (Merton 1973 Continuous Dividend Yield)**: `MertonYieldEngine` định giá quyền chọn trên tài sản có cổ tức liên tục $q$ (chỉ số, FX), tính toán hệ số Greeks giải tích toàn diện: Delta, Gamma, Vega, Theta, Rho, Dividend Rho (Phi), Vanna, Volga.

## II. Tiêu chuẩn Kỹ thuật
- 100% pure TypeScript, zero external math/regression libraries.
- Giới hạn kích thước file: $\le 200$ LOC mỗi file.
- Chuẩn kiểu: Zero `:any` types.
- Đầy đủ zero-mock Vitest unit tests (3 tests mỗi desk, tổng cộng 9 tests mới).

## III. Phân rã Files & Đường dẫn
1. `src/desk/bdt/bdt-types.ts`
2. `src/desk/bdt/bdt-engine.ts`
3. `tests/unit/desk/bdt/bdt-suite.test.ts`
4. `src/desk/huangstoll/huang-stoll-types.ts`
5. `src/desk/huangstoll/huang-stoll-engine.ts`
6. `tests/unit/desk/huangstoll/huang-stoll-suite.test.ts`
7. `src/desk/merton/merton-yield-types.ts`
8. `src/desk/merton/merton-yield-engine.ts`
9. `tests/unit/desk/merton/merton-yield-suite.test.ts`
