/**
 * Methodology Page — Institutional Quantitative Trading Architecture
 * Explains Binh Pháp multi-layer stealth execution, Equal Risk Contribution (ERC)
 * risk parity portfolio allocation, and purged walk-forward validation.
 * Dark fintech aesthetic, bilingual VN+EN, WCAG AA compliant.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Footer } from '../components/footer';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

interface MethodologyContent {
  langToggle: string;
  langLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  backHome: string;
  readManifesto: string;
  layersTitle: string;
  layersDesc: string;
  layer1Title: string;
  layer1Desc: string;
  layer1Detail: string[];
  layer2Title: string;
  layer2Desc: string;
  layer2Detail: string[];
  layer3Title: string;
  layer3Desc: string;
  layer3Detail: string[];
  riskParityTitle: string;
  riskParityDesc: string;
  riskParityEquation: string;
  riskParityPoints: { term: string; explanation: string }[];
  validationTitle: string;
  validationDesc: string;
  validationPipeline: { step: string; detail: string }[];
  parametersTitle: string;
  parameters: { metric: string; target: string; rationale: string }[];
}

const CONTENT: Record<Lang, MethodologyContent> = {
  en: {
    langToggle: 'Tiếng Việt',
    langLabel: 'Switch to Vietnamese',
    eyebrow: 'Institutional Spec · Binh Pháp Architecture v2.4',
    title: 'Quantitative Trading Methodology',
    subtitle:
      'Mathematical foundations, multi-tier execution security, Equal Risk Contribution (ERC) portfolio allocation, and leakage-free walk-forward optimization.',
    backHome: '← Platform Home',
    readManifesto: 'Read Manifesto →',
    layersTitle: '1. Three-Layer Binh Pháp Stealth Architecture',
    layersDesc:
      'High-frequency microstructure execution on prediction markets and decentralized CLOBs presents adversarial front-running and exchange tracking risks. The execution engine enforces a three-stage defense pipeline.',
    layer1Title: 'Layer 1: Microstructure Order Randomizer',
    layer1Desc: 'Obfuscates execution patterns at the millisecond tick level.',
    layer1Detail: [
      'Poisson-distributed inter-arrival times: Δt ~ Exp(λ) with ±30% randomized jitter.',
      'Log-normal sizing: order quantities perturbed by ±5% to disrupt deterministic round-number detection.',
      'Adaptive Rate Governor: enforces request intervals within 40%–65% of exchange rate limit ceilings.',
      'Pattern Breaker: eliminates periodic heartbeat footprints across websocket and REST channels.',
    ],
    layer2Title: 'Layer 2: Phantom Cloaking Engine',
    layer2Desc: 'Manages operational sessions, inventory splitting, and liquidity footprint suppression.',
    layer2Detail: [
      'Session Lifecycle: 20–90 min non-deterministic active execution windows followed by 5–20 min quiet phases.',
      'Child Order Slicing: decomposes large target parent fills into 3–5 synthetic tranches.',
      'Off-The-Record (OTR) sessions: ephemeral TLS connection pooling and request fingerprint rotation.',
      'Decoy Liquidity: places low-impact non-actionable resting quotes to conceal net inventory buildup.',
    ],
    layer3Title: 'Layer 3: Strategic Regime-Aware Heuristics',
    layer3Desc: 'Adaptive multi-exchange routing governed by Sun Tzu tactical principles.',
    layer3Detail: [
      'Regime Classifier: switches dynamically between StatArb, Mean-Reversion, and Trend regimes.',
      'Cross-Exchange Spread Arbitrage: requires net edge >0.10% post-gas, exchange fee, and slippage buffers.',
      'Adverse Selection Guard: instantaneous tick aging filter (<3s) rejects stale price quotes.',
      'Emergency Circuit Breaker: automated position flattening upon detecting correlated tail events.',
    ],
    riskParityTitle: '2. Dynamic Risk Parity (Equal Risk Contribution)',
    riskParityDesc:
      'Traditional capital allocation concentrates risk in the most volatile strategy family. CashClaw implements an Equal Risk Contribution (ERC) optimization solver where each strategy contributes identically to total portfolio variance.',
    riskParityEquation: 'RC_i = w_i · [Σw]_i / √(w^T Σ w) = σ_p / N',
    riskParityPoints: [
      {
        term: 'Iterative Cyclical Solver',
        explanation: 'Newton-Raphson coordinate descent converges to equal risk contributions within ε ≤ 1e-4 tolerance.',
      },
      {
        term: 'Exponential Covariance Matrix',
        explanation: 'Rolling covariance estimates use exponential weighting (half-life = 14 days) to capture volatility clustering.',
      },
      {
        term: 'Strategy Families',
        explanation: 'Balanced across Cross-Exchange StatArb, Directional Momentum, Mean Reversion, and Triangular Liquidity Provision.',
      },
      {
        term: 'Maximum Concentration Cap',
        explanation: 'No single market pair may command >25% of gross allocated margin regardless of theoretical edge.',
      },
    ],
    validationTitle: '3. Leakage-Free Walk-Forward Validation',
    validationDesc:
      'Backtest overfitting is the primary cause of automated trading failure. All production models undergo rigorous anchored walk-forward validation with strict combinatorial embargoes.',
    validationPipeline: [
      {
        step: '70% / 30% In-Sample / Out-of-Sample Split',
        detail: 'Hyperparameter grid search is executed solely on historical training windows; validation occurs strictly out-of-sample.',
      },
      {
        step: 'Combinatorial Purged K-Fold',
        detail: 'Training samples immediately preceding and following test windows are purged to prevent serial autocorrelation leakage.',
      },
      {
        step: '48-Hour Embargo Buffer',
        detail: 'Enforces an explicit embargo interval after each test horizon to eliminate overlapping trade label contamination.',
      },
      {
        step: 'Robustness Metric Verification (R ≥ 0.50)',
        detail: 'Robustness ratio R = Sharpe(OOS) / Sharpe(IS). Strategies with R < 0.30 are flagged as overfitted and discarded.',
      },
    ],
    parametersTitle: '4. Institutional Risk Parameters & Operational Gates',
    parameters: [
      { metric: 'Maximum Drawdown Stop', target: '12.0%', rationale: 'Mandatory kill-switch trigger and orderly portfolio flattening.' },
      { metric: 'Daily Value at Risk (99% VaR)', target: '< 2.50%', rationale: 'Parametric and historical 24-hour downside tail risk budget.' },
      { metric: 'Max Single-Trade Exposure', target: '2.00%', rationale: 'Upper bound on total equity at risk per discrete fill.' },
      { metric: 'Rebalance Cadence', target: 'Hourly / Dynamic', rationale: 'Triggers when strategy weight drift exceeds ±2.5% threshold.' },
      { metric: 'Tick Age Limit', target: '< 3,000 ms', rationale: 'Rejection of stale market quotes to protect against latency arbitrage.' },
      { metric: 'Minimum Net Arb Edge', target: '> 10 bps', rationale: 'Threshold net of maker/taker fees, gas fees, and estimated slippage.' },
    ],
  },
  vi: {
    langToggle: 'English',
    langLabel: 'Chuyển sang tiếng Anh',
    eyebrow: 'Đặc Tả Tổ Chức · Kiến Trúc Binh Pháp v2.4',
    title: 'Phương Pháp Luận Định Lượng',
    subtitle:
      'Nền tảng toán học, bảo mật thực thi đa tầng, phân bổ danh mục theo Rủi Ro Bình Đẳng (ERC) và tối ưu hóa Walk-Forward chống rò rỉ dữ liệu.',
    backHome: '← Trang Chủ Nền Tảng',
    readManifesto: 'Đọc Tuyên Ngôn →',
    layersTitle: '1. Kiến Trúc Ẩn Danh 3 Lớp Binh Pháp',
    layersDesc:
      'Khớp lệnh tần suất cao trên các thị trường dự đoán và CLOB đối mặt với rủi ro bị front-running và exchange tracking. Hệ thống áp dụng chuỗi phòng vệ 3 lớp.',
    layer1Title: 'Lớp 1: Ngẫu Nhiên Hóa Cấu Trúc Vi Mô (Microstructure Randomizer)',
    layer1Desc: 'Xóa mờ dấu vết khớp lệnh ở mức mili-giây.',
    layer1Detail: [
      'Khoảng thời gian ngẫu nhiên theo phân phối Poisson: Δt ~ Exp(λ) với độ lệch ngẫu nhiên ±30%.',
      'Kích thước lệnh log-normal: khối lượng đặt lệnh biến thiên ±5% để phá vỡ nhận diện số tròn định sẵn.',
      'Bộ điều tốc thích ứng (Adaptive Rate Governor): giới hạn tần suất yêu cầu ở mức 40%–65% ngưỡng rate limit của sàn.',
      'Triệt tiêu chu kỳ nhịp tim (Pattern Breaker): loại bỏ mẫu tín hiệu tuần hoàn trên kênh websocket và REST.',
    ],
    layer2Title: 'Lớp 2: Động Cơ Tàng Hình Phantom (Phantom Cloaking Engine)',
    layer2Desc: 'Quản lý phiên giao dịch, chia nhỏ lệnh và che giấu tích lũy vị thế.',
    layer2Detail: [
      'Vòng đời phiên: chu kỳ giao dịch 20–90 phút không định trước, tiếp nối bởi 5–20 phút nghỉ ngơi.',
      'Chia nhỏ lệnh lớn: phân rã khối lượng mục tiêu thành 3–5 lệnh con ngẫu nhiên.',
      'Phiên Off-The-Record (OTR): luân chuyển pool kết nối TLS ngắn hạn và dấu vân tay yêu cầu.',
      'Thanh khoản chim mồi (Decoy Liquidity): treo lệnh biên độ an toàn để che giấu xu hướng gom vị thế ròng.',
    ],
    layer3Title: 'Lớp 3: Chiến Thuật Thích Ứng Theo Binh Pháp Tôn Tử',
    layer3Desc: 'Định tuyến lệnh thông minh theo chế độ thị trường dựa trên 13 thiên Binh Pháp.',
    layer3Detail: [
      'Phân loại chế độ thị trường: tự động chuyển đổi giữa Arb chênh lệch giá, Mean-Reversion và Theo xu hướng.',
      'Khai thác chênh lệch liên sàn: yêu cầu biên lợi nhuận ròng >0.10% sau khi trừ gas, phí sàn và trượt giá.',
      'Bảo vệ chống thông tin bất lợi: bộ lọc độ trễ tick (<3 giây) từ chối giá cũ quá hạn.',
      'Ngắt mạch khẩn cấp (Circuit Breaker): tự động tất toán vị thế khi phát hiện sự kiện đuôi tương quan rủi ro.',
    ],
    riskParityTitle: '2. Phân Bổ Rủi Ro Bình Đẳng (Equal Risk Contribution - ERC)',
    riskParityDesc:
      'Phân bổ vốn truyền thống dồn rủi ro vào chiến lược biến động mạnh nhất. CashClaw giải bài toán tối ưu Equal Risk Contribution (ERC) đảm bảo mỗi chiến lược đóng góp tỷ trọng bằng nhau vào tổng phương sai danh mục.',
    riskParityEquation: 'RC_i = w_i · [Σw]_i / √(w^T Σ w) = σ_p / N',
    riskParityPoints: [
      {
        term: 'Thuật Toán Tọa Độ Lặp (Coordinate Descent)',
        explanation: 'Phương pháp lặp Newton-Raphson hội tụ đóng góp rủi ro bằng nhau với sai số ε ≤ 1e-4.',
      },
      {
        term: 'Ma Trận Hiệp Phương Sai Hàm Mũ',
        explanation: 'Ước lượng ma trận hiệp phương sai theo trọng số suy giảm hàm mũ (chu kỳ bán rã 14 ngày) để bắt trọn cụm biến động.',
      },
      {
        term: 'Cụm Chiến Lược Đa Dạng',
        explanation: 'Cân bằng giữa StatArb liên sàn, Momentum xu hướng, Mean Reversion và Tạo lập thị trường tam giác.',
      },
      {
        term: 'Giới Hạn Tập Trung Tối Đa',
        explanation: 'Không cặp giao dịch đơn lẻ nào được chiếm quá 25% tổng ký quỹ bất kể biên độ kỳ vọng.',
      },
    ],
    validationTitle: '3. Kiểm Định Walk-Forward Chống Rò Rỉ Dữ Liệu',
    validationDesc:
      'Overfitting trong backtest là nguyên nhân số một khiến bot thất bại ngoài đời thực. Mọi mô hình đều phải vượt qua quy trình kiểm định Walk-Forward với rào chắn embargo nghiêm ngặt.',
    validationPipeline: [
      {
        step: 'Phân Tách 70% In-Sample / 30% Out-of-Sample',
        detail: 'Quét siêu tham số chỉ thực hiện trên tập dữ liệu lịch sử huấn luyện; kiểm định tuyệt đối độc lập trên tập mẫu ngoài.',
      },
      {
        step: 'Purged K-Fold Kết Hợp',
        detail: 'Loại bỏ các mẫu dữ liệu ngay trước và sau ranh giới kiểm tra để triệt tiêu tự tương quan chuỗi thời gian.',
      },
      {
        step: 'Vùng Đệm Cấm (48-Hour Embargo)',
        detail: 'Áp dụng khoảng cấm 48 giờ sau mỗi khung kiểm tra nhằm ngăn chặn rò rỉ nhãn giao dịch gối đầu.',
      },
      {
        step: 'Xác Minh Chỉ Số Vững Chắc (R ≥ 0.50)',
        detail: 'Tỷ số R = Sharpe(OOS) / Sharpe(IS). Chiến lược có R < 0.30 bị loại bỏ ngay lập tức vì quá khớp mẫu.',
      },
    ],
    parametersTitle: '4. Thông Số Rủi Ro Tổ Chức & Cổng Vận Hành',
    parameters: [
      { metric: 'Giới Hạn Sụt Giảm Tối Đa (Max DD)', target: '12.0%', rationale: 'Kích hoạt công tắc ngắt khẩn cấp và thanh lý có trật tự.' },
      { metric: 'Giá Trị Rủi Ro Ngày (99% VaR)', target: '< 2.50%', rationale: 'Ngân sách rủi ro đuôi 24 giờ ước tính theo tham số và lịch sử.' },
      { metric: 'Hạn Mức Một Lệnh Tối Đa', target: '2.00%', rationale: 'Tỷ lệ vốn tối đa cho phép chịu rủi ro trên một lần khớp đơn lẻ.' },
      { metric: 'Tần Suất Tái Cân Bằng', target: 'Hàng giờ / Linh hoạt', rationale: 'Kích hoạt khi tỷ trọng chiến lược lệch quá ngưỡng ±2.5%.' },
      { metric: 'Giới Hạn Độ Tuổi Tick Giá', target: '< 3,000 ms', rationale: 'Từ chối báo giá trễ để bảo vệ trước rủi ro latency arbitrage.' },
      { metric: 'Biên Lợi Nhuận Arb Tối Thiểu', target: '> 10 bps', rationale: 'Ngưỡng lợi nhuận ròng sau khi khấu trừ phí maker/taker, gas và trượt giá.' },
    ],
  },
};

export function MethodologyPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = CONTENT[lang];

  return (
    <div
      className="min-h-screen font-sans flex flex-col"
      style={{ backgroundColor: COLORS.bg, color: COLORS.onSurface }}
    >
      {/* Header bar */}
      <header
        className="sticky top-0 z-40 backdrop-blur-xl border-b transition-colors"
        style={{
          backgroundColor: `${COLORS.bg}EE`,
          borderColor: COLORS.outline,
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-sm font-semibold hover:opacity-80 transition-opacity"
              style={{ color: COLORS.primary }}
            >
              {t.backHome}
            </Link>
            <span style={{ color: COLORS.outline }}>/</span>
            <span
              className="text-xs uppercase tracking-widest font-mono hidden sm:inline"
              style={{ color: COLORS.onSurfaceVariant }}
            >
              METHODOLOGY_DOC
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/manifesto"
              className="text-xs sm:text-sm font-medium hover:underline transition-colors hidden sm:inline-block"
              style={{ color: COLORS.onSurfaceVariant }}
            >
              {t.readManifesto}
            </Link>
            <button
              onClick={() => setLang((l) => (l === 'en' ? 'vi' : 'en'))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
              style={{
                backgroundColor: `${COLORS.surface}CC`,
                borderColor: COLORS.outline,
                color: COLORS.onSurfaceVariant,
              }}
              aria-label={t.langLabel}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
              </svg>
              <span>{t.langToggle}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-16 w-full">
        {/* Hero Section */}
        <div className="border-b pb-10" style={{ borderColor: COLORS.outline }}>
          <p
            className="text-xs font-mono uppercase tracking-[0.2em] mb-3"
            style={{ color: COLORS.primary }}
          >
            {t.eyebrow}
          </p>
          <h1
            className="text-3xl sm:text-5xl font-bold tracking-tight mb-6"
            style={{ color: COLORS.onSurface }}
          >
            {t.title}
          </h1>
          <p
            className="text-base sm:text-lg leading-relaxed max-w-3xl"
            style={{ color: COLORS.onSurfaceVariant }}
          >
            {t.subtitle}
          </p>
        </div>

        {/* Section 1: 3-Layer Stealth Architecture */}
        <section className="space-y-6">
          <div>
            <h2
              className="text-xl sm:text-2xl font-bold mb-3"
              style={{ color: COLORS.onSurface }}
            >
              {t.layersTitle}
            </h2>
            <p
              className="text-sm leading-relaxed max-w-3xl"
              style={{ color: COLORS.onSurfaceVariant }}
            >
              {t.layersDesc}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Layer 1 */}
            <div
              className="rounded-2xl p-6 border transition-all"
              style={{
                backgroundColor: `${COLORS.surface}99`,
                borderColor: COLORS.outline,
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold mb-4"
                style={{
                  backgroundColor: `${COLORS.primary}20`,
                  color: COLORS.primary,
                }}
              >
                L1
              </div>
              <h3
                className="text-base font-semibold mb-2"
                style={{ color: COLORS.onSurface }}
              >
                {t.layer1Title}
              </h3>
              <p
                className="text-xs leading-relaxed mb-4"
                style={{ color: COLORS.onSurfaceVariant }}
              >
                {t.layer1Desc}
              </p>
              <ul className="space-y-2 text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                {t.layer1Detail.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span style={{ color: COLORS.primary }}>▹</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Layer 2 */}
            <div
              className="rounded-2xl p-6 border transition-all"
              style={{
                backgroundColor: `${COLORS.surface}99`,
                borderColor: COLORS.outline,
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold mb-4"
                style={{
                  backgroundColor: `${COLORS.profit}20`,
                  color: COLORS.profit,
                }}
              >
                L2
              </div>
              <h3
                className="text-base font-semibold mb-2"
                style={{ color: COLORS.onSurface }}
              >
                {t.layer2Title}
              </h3>
              <p
                className="text-xs leading-relaxed mb-4"
                style={{ color: COLORS.onSurfaceVariant }}
              >
                {t.layer2Desc}
              </p>
              <ul className="space-y-2 text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                {t.layer2Detail.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span style={{ color: COLORS.profit }}>▹</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Layer 3 */}
            <div
              className="rounded-2xl p-6 border transition-all"
              style={{
                backgroundColor: `${COLORS.surface}99`,
                borderColor: COLORS.outline,
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold mb-4"
                style={{
                  backgroundColor: `${COLORS.warning}20`,
                  color: COLORS.warning,
                }}
              >
                L3
              </div>
              <h3
                className="text-base font-semibold mb-2"
                style={{ color: COLORS.onSurface }}
              >
                {t.layer3Title}
              </h3>
              <p
                className="text-xs leading-relaxed mb-4"
                style={{ color: COLORS.onSurfaceVariant }}
              >
                {t.layer3Desc}
              </p>
              <ul className="space-y-2 text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                {t.layer3Detail.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span style={{ color: COLORS.warning }}>▹</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Section 2: Risk Parity */}
        <section className="space-y-6">
          <div>
            <h2
              className="text-xl sm:text-2xl font-bold mb-3"
              style={{ color: COLORS.onSurface }}
            >
              {t.riskParityTitle}
            </h2>
            <p
              className="text-sm leading-relaxed max-w-3xl"
              style={{ color: COLORS.onSurfaceVariant }}
            >
              {t.riskParityDesc}
            </p>
          </div>

          <div
            className="rounded-2xl p-6 sm:p-8 border font-mono text-center text-sm sm:text-base tracking-wider overflow-x-auto"
            style={{
              backgroundColor: `${COLORS.surfaceHigh}80`,
              borderColor: COLORS.outline,
              color: COLORS.primary,
            }}
          >
            {t.riskParityEquation}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {t.riskParityPoints.map((pt) => (
              <div
                key={pt.term}
                className="rounded-xl p-5 border"
                style={{
                  backgroundColor: `${COLORS.surface}80`,
                  borderColor: COLORS.outline,
                }}
              >
                <p
                  className="font-semibold text-sm mb-1.5"
                  style={{ color: COLORS.onSurface }}
                >
                  {pt.term}
                </p>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: COLORS.onSurfaceVariant }}
                >
                  {pt.explanation}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Walk-Forward Validation */}
        <section className="space-y-6">
          <div>
            <h2
              className="text-xl sm:text-2xl font-bold mb-3"
              style={{ color: COLORS.onSurface }}
            >
              {t.validationTitle}
            </h2>
            <p
              className="text-sm leading-relaxed max-w-3xl"
              style={{ color: COLORS.onSurfaceVariant }}
            >
              {t.validationDesc}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {t.validationPipeline.map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl p-5 border"
                style={{
                  backgroundColor: `${COLORS.surface}80`,
                  borderColor: COLORS.outline,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="font-mono text-xs px-2 py-0.5 rounded font-bold"
                    style={{
                      backgroundColor: `${COLORS.primary}20`,
                      color: COLORS.primary,
                    }}
                  >
                    STEP {idx + 1}
                  </span>
                  <p
                    className="font-semibold text-sm"
                    style={{ color: COLORS.onSurface }}
                  >
                    {item.step}
                  </p>
                </div>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: COLORS.onSurfaceVariant }}
                >
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Parameters Table */}
        <section className="space-y-6">
          <div>
            <h2
              className="text-xl sm:text-2xl font-bold mb-3"
              style={{ color: COLORS.onSurface }}
            >
              {t.parametersTitle}
            </h2>
          </div>

          <div
            className="rounded-2xl border overflow-x-auto"
            style={{
              backgroundColor: `${COLORS.surface}80`,
              borderColor: COLORS.outline,
            }}
          >
            <table className="w-full text-left text-xs sm:text-sm">
              <thead
                className="border-b font-mono uppercase text-xs"
                style={{
                  backgroundColor: `${COLORS.surfaceHigh}80`,
                  borderColor: COLORS.outline,
                  color: COLORS.onSurfaceVariant,
                }}
              >
                <tr>
                  <th className="py-3 px-4 font-semibold">Risk Constraint</th>
                  <th className="py-3 px-4 font-semibold">Threshold</th>
                  <th className="py-3 px-4 font-semibold">Institutional Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: COLORS.outline }}>
                {t.parameters.map((p, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td
                      className="py-3.5 px-4 font-medium"
                      style={{ color: COLORS.onSurface }}
                    >
                      {p.metric}
                    </td>
                    <td
                      className="py-3.5 px-4 font-mono font-bold"
                      style={{ color: COLORS.primary }}
                    >
                      {p.target}
                    </td>
                    <td
                      className="py-3.5 px-4 text-xs leading-relaxed"
                      style={{ color: COLORS.onSurfaceVariant }}
                    >
                      {p.rationale}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
