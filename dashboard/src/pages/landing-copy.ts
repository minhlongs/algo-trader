/**
 * Bilingual VN+EN copy dictionary for Solo Quant Desk landing page (`/`).
 * Polar-safe copy: no "AI", "wellness", "health", "medical", or "fitness".
 * Implements the Dual-Funnel model: Proof-of-Work -> CashClaw RaaS ($0 / $49 / $199).
 */

export type LandingLang = 'en' | 'vi';

export interface PrincipleItem {
  label: string;
  body: string;
}

export interface LandingCopyEntry {
  langToggle: string;
  principlesEyebrow: string;
  principles: readonly [PrincipleItem, PrincipleItem, PrincipleItem, PrincipleItem];
  dualFunnelEyebrow: string;
  dualFunnelTitle: string;
  dualFunnelBody: string;
  ctaMethodologyBtn: string;
  ctaPricingBtn: string;
  ctaSignupBtn: string;
  ctaManifestoBtn: string;
  viewSourceBtn: string;
}

export const LANDING_COPY: Record<LandingLang, LandingCopyEntry> = {
  en: {
    langToggle: 'Tiếng Việt',
    principlesEyebrow: 'What the desk refuses to become',
    principles: [
      {
        label: 'One human',
        body: 'No employees, no contractors. The operator runs every module — research, sizing, execution, monitoring.',
      },
      {
        label: 'Zero overhead',
        body: 'M1 Max workstation, a local model on port 11435, SQLite, Cloudflare edge. Disciplined infrastructure with fail-closed risk guards.',
      },
      {
        label: 'Open methodology',
        body: 'Blind-prompt alpha extraction. Quarter-Kelly sizing. Event markets only. Source repository and backtest sample warnings are public.',
      },
      {
        label: 'Verifiable',
        body: 'Every paper and live trade is recorded. Batches are published on cadence. Losing weeks are posted alongside winning ones.',
      },
    ],
    dualFunnelEyebrow: 'Dual-Funnel · Proof-of-Work to Production RaaS',
    dualFunnelTitle: 'Audit the methodology — or deploy CashClaw on your own desk.',
    dualFunnelBody:
      'Every batch and drawdown metric is verifiable in public. Start on the Free tier ($0/mo, 1 active strategy, 10 trades/day) or upgrade to Pro ($49/mo) and Enterprise ($199/mo) with non-custodial Polymarket execution.',
    ctaMethodologyBtn: 'Explore Methodology & Data',
    ctaPricingBtn: 'View Plans ($0 / $49 / $199)',
    ctaSignupBtn: 'Create Free Account',
    ctaManifestoBtn: 'Read the Manifesto',
    viewSourceBtn: 'View Source',
  },
  vi: {
    langToggle: 'English',
    principlesEyebrow: 'Những nguyên tắc bất di bất dịch của bàn giao dịch',
    principles: [
      {
        label: 'Một người vận hành',
        body: 'Không nhân sự cồng kềnh, không bên thứ ba. Một nhà nghiên cứu trực tiếp kiểm soát toàn bộ module — nghiên cứu, tính toán vị thế, khớp lệnh và giám sát.',
      },
      {
        label: 'Không chi phí thừa',
        body: 'Trạm làm việc M1 Max, mô hình cục bộ trên cổng 11435, SQLite và hạ tầng Cloudflare. Bảo vệ vốn tự động bằng cơ chế ngắt mạch Fail-Closed.',
      },
      {
        label: 'Phương pháp minh bạch',
        body: 'Trích xuất tín hiệu độc lập (Blind-Prompt), quản lý vốn Quarter-Kelly trên thị trường sự kiện Polymarket. Cảnh báo rõ các mẫu thử nghiệm dưới 30 lệnh.',
      },
      {
        label: 'Có thể kiểm chứng',
        body: 'Mọi lệnh giao dịch thử nghiệm và thực tế đều được ghi nhận. Kết quả công bố định kỳ, minh bạch cả những tuần sụt giảm lẫn tuần tăng trưởng.',
      },
    ],
    dualFunnelEyebrow: 'Phễu Kép · Từ Kiểm Chứng Thực Thực Tế Đến Nền Tảng RaaS',
    dualFunnelTitle: 'Kiểm chứng phương pháp luận — hoặc triển khai CashClaw cho riêng bạn.',
    dualFunnelBody:
      'Toàn bộ dữ liệu giao dịch và mức sụt giảm đều công khai. Bắt đầu ngay với Gói Miễn Phí ($0/tháng, 1 chiến lược, 10 lệnh/ngày) hoặc nâng cấp lên Pro ($49/tháng) và Enterprise ($199/tháng) không lưu ký vốn.',
    ctaMethodologyBtn: 'Khám Phá Phương Pháp & Dữ Liệu',
    ctaPricingBtn: 'Xem Bảng Giá ($0 / $49 / $199)',
    ctaSignupBtn: 'Đăng Ký Miễn Phí Ngay',
    ctaManifestoBtn: 'Đọc Tuyên Ngôn',
    viewSourceBtn: 'Xem Mã Nguồn',
  },
};
