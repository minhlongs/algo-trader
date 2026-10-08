# Kế Hoạch & Thiết Kế Kiến Trúc Wave 87-89: Nelson-Siegel-Svensson, Cont-Stoikov & Bjerksund-Stensland (2002)

## 1. Bối cảnh & Mục tiêu
Tiếp nối Wave 84-86 (G2++, Realized Kernel, BAW), Wave 87-89 mở rộng khả năng định lượng của hệ thống:
1. **Desk 87: Nelson-Siegel-Svensson (NSS 1994) Yield Curve Engine**
   - Khớp đường cong lãi suất phi tuyến 6 tham số: $\beta_0$ (level), $\beta_1$ (slope), $\beta_2$ (curvature 1), $\beta_3$ (curvature 2), $\tau_1, \tau_2$ (scale parameters).
   - Công thức zero rate $y(m)$ và instantaneous forward rate $f(m)$.
   - Chiết khấu trái phiếu và độ nhạy duration/convexity.

2. **Desk 88: Cont-Stoikov (2010) Markovian Limit Order Book (LOB) Queue Dynamics**
   - Mô hình hoá hàng đợi sổ lệnh tại Bid/Ask qua quá trình sinh-tử (Birth-Death / Markovian queue).
   - Tốc độ khớp lệnh $\mu$, hủy lệnh $\theta$, đặt lệnh mới $\lambda$.
   - Tính xác suất khớp lệnh ưu tiên trước khi giá dịch chuyển: $P_{fill}(q_b, q_a)$.

3. **Desk 89: Bjerksund-Stensland (2002) American Option Closed-Form Approximation**
   - Mô hình tối ưu hóa 2 vùng kích hoạt thực hiện sớm cho American Call/Put với chi phí nắm giữ (cost of carry) $b = r - q$.
   - Chính xác và ổn định hơn phương pháp BAW (1987) đối với kỳ hạn dài ($T > 1$ năm).
   - Phân tích ranh giới tới hạn phẳng $I_1$ và $I_2$.

---

## 2. Phân Rã Module (Tuân thủ $\le 200$ LOC mỗi file)

### Desk 87: `src/desk/nss/`
- `nss-types.ts` (~30 LOC): Interfaces tham số NSS, curve point, discount result.
- `nss-curve.ts` (~90 LOC): Tính zero rates, forward rates, discount factors theo $m, \beta, \tau$.
- `nss-engine.ts` (~80 LOC): Định giá trái phiếu, ước lượng macaulay/modified duration.

### Desk 88: `src/desk/contstoikov/`
- `cont-stoikov-types.ts` (~30 LOC): Queue state, rate parameters, fill probability result.
- `cont-stoikov-queue.ts` (~90 LOC): Giải ma trận xác suất hấp thụ (absorption probability) cho hàng đợi.
- `cont-stoikov-engine.ts` (~80 LOC): Đánh giá fill probabilities, expected waiting time tại top-of-book.

### Desk 89: `src/desk/bjerksund/`
- `bjerksund-types.ts` (~30 LOC): Option parameters, boundary values, pricing result.
- `bjerksund-boundary.ts` (~80 LOC): Tính ranh giới thực hiện sớm $I_1, I_2$ và số mũ $\beta$.
- `bjerksund-engine.ts` (~110 LOC): Hàm phi phân phối nhị biến (phi function) và định giá Call/Put.

---

## 3. Chiến Lược Kiểm Thử (Vitest Zero-Mock)
- `tests/unit/desk/nss/nss-suite.test.ts`: Kiểm tra zero rates hội tụ về $\beta_0$ khi $m \to \infty$, về $\beta_0+\beta_1$ khi $m \to 0$.
- `tests/unit/desk/contstoikov/cont-stoikov-suite.test.ts`: Kiểm tra tính đơn điệu của xác suất khớp lệnh theo vị trí hàng đợi.
- `tests/unit/desk/bjerksund/bjerksund-suite.test.ts`: Kiểm tra giá American $\ge$ European Black-Scholes, tính đối ngẫu Put-Call.
