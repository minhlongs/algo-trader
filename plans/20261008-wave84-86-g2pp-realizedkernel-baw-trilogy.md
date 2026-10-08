# Kế hoạch Triển khai Wave 84-86 Trilogy (G2++, Realized Kernel, BAW American Option)

## I. Mục tiêu & Phạm vi
Triển khai bộ ba định giá và kinh tế lượng vi cấu trúc thị trường định chế:
1. **Desk 84 (Hull-White 2-Factor Short Rate G2++)**: `G2ppEngine` mô hình lãi suất 2 yếu tố tương quan $dx = -a x dt + \sigma dW_1$, $dy = -b y dt + \eta dW_2$ với $dW_1 dW_2 = \rho dt$. Tính toán analytical variance integral $V(t, T)$, zero-coupon bond pricing $P(t, T)$, yield to maturity và instantaneous forward rate $f(t, T)$.
2. **Desk 85 (Barndorff-Nielsen Realized Kernel Microstructure Noise Engine)**: `RealizedKernelEngine` khử nhiễu vi cấu trúc tần số cao bằng Parzen và Modified Tukey-Hanning kernels, tính toán autocovariances $\gamma_h$, plug-in optimal bandwidth $H^* \sim c \cdot (\omega^2 / \sqrt{IV})^{4/5} n^{3/5}$, và annualized volatility.
3. **Desk 86 (Barone-Adesi & Whaley 1987 American Option Engine)**: `BawEngine` định giá American Call & Put trên tài sản có tỷ suất cổ tức liên tục $q$. Giải nghiệm số safeguarded Newton-Raphson cho điểm thực hiện sớm tới hạn $S^*$, xác định early exercise premium $A_i (S/S^*)^{q_i}$ và thỏa mãn smooth-pasting condition.

## II. Tiêu chuẩn Kỹ thuật
- 100% pure TypeScript, zero external math/regression/matrix libraries.
- Giới hạn kích thước file: Tất cả file $\le 200$ LOC.
- An toàn kiểu: Zero `:any` types; `npx tsc --noEmit` đạt 0 lỗi.
- Đầy đủ zero-mock Vitest unit tests (3 tests mỗi desk, tổng cộng 9 tests mới).

## III. Phân rã Files & Đường dẫn
1. `src/desk/g2pp/g2pp-types.ts`
2. `src/desk/g2pp/g2pp-variance.ts`
3. `src/desk/g2pp/g2pp-engine.ts`
4. `tests/unit/desk/g2pp/g2pp-suite.test.ts`
5. `src/desk/realizedkernel/realized-kernel-types.ts`
6. `src/desk/realizedkernel/kernel-weights.ts`
7. `src/desk/realizedkernel/realized-kernel-engine.ts`
8. `tests/unit/desk/realizedkernel/realized-kernel-suite.test.ts`
9. `src/desk/baw/baw-types.ts`
10. `src/desk/baw/baw-engine.ts`
11. `tests/unit/desk/baw/baw-suite.test.ts`
