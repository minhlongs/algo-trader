/**
 * RiskSettingsPage — Centralized risk management settings
 */
import { useState } from 'react';
import { useRiskPreferencesStore } from '../stores/risk-preferences-store';
import { AutoCloseForm } from '../components/risk/auto-close-form';
import { CircuitBreakerForm } from '../components/risk/circuit-breaker-form';
import { NotificationPreferencesForm } from '../components/notifications/NotificationPreferencesForm';
import { StitchCard, StitchCardBody } from '../components/ui/stitch-card';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, {
  langToggle: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  sectionAutoClose: string;
  sectionCircuitBreaker: string;
  sectionNotifications: string;
  btnReset: string;
  btnResetConfirm: string;
  infoTitle: string;
  infoBody: string;
  riskLabel: string;
  thresholdLabel: string;
  stopLoss: string;
  takeProfit: string;
  maxDrawdown: string;
  dailyLossLimit: string;
}> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Risk Settings',
    subtitle: 'Manage your trading risk parameters and automated safeguards',
    eyebrow: 'Risk Management',
    sectionAutoClose: 'Auto-Close Rules',
    sectionCircuitBreaker: 'Circuit Breaker',
    sectionNotifications: 'Notification Preferences',
    btnReset: 'Reset All to Defaults',
    btnResetConfirm: 'Are you sure you want to reset all risk settings to defaults?',
    infoTitle: 'Risk Management Tips',
    infoBody: 'These settings control automated safeguards for your trading activity. Auto-close rules exit positions when profit targets or stop losses are hit. The circuit breaker halts trading after a series of losses or excessive drawdown. Notifications keep you informed of important events. Adjust these according to your risk tolerance.',
    riskLabel: 'Risk',
    thresholdLabel: 'Threshold',
    stopLoss: 'Stop Loss',
    takeProfit: 'Take Profit',
    maxDrawdown: 'Max Drawdown',
    dailyLossLimit: 'Daily Loss Limit',
  },
  vi: {
    langToggle: 'English',
    title: 'Cài Đặt Quản Lý Rủi Ro',
    subtitle: 'Quản lý tham số rủi ro giao dịch và biện pháp tự động bảo vệ',
    eyebrow: 'Quản Lý Rủi Ro',
    sectionAutoClose: 'Quy Tắc Tự Đóng',
    sectionCircuitBreaker: 'Cầu Dao An Toàn',
    sectionNotifications: 'Tùy Chọn Thông Báo',
    btnReset: 'Đặt Lại Tất Cả Mặc Định',
    btnResetConfirm: 'Bạn có chắc muốn đặt lại tất cả cài đặt rủi ro về mặc định?',
    infoTitle: 'Mẹo Quản Lý Rủi Ro',
    infoBody: 'Các cài đặt này kiểm soát biện pháp tự động bảo vệ hoạt động giao dịch của bạn. Quy tắc tự đóng thoát vị thế khi đạt mục tiêu lợi nhuận hoặc cắt lỗ. Cầu dao an toàn dừng giao dịch sau chuỗi lỗ hoặc sụt giảm quá mức. Thông báo giúp bạn theo dõi các sự kiện quan trọng. Điều chỉnh theo khả năng chịu rủi ro của bạn.',
    riskLabel: 'Rủi Ro',
    thresholdLabel: 'Ngưỡng',
    stopLoss: 'Cắt Lỗ',
    takeProfit: 'Chốt Lời',
    maxDrawdown: 'Sụt Giảm Tối Đa',
    dailyLossLimit: 'Giới Hạn Lỗ Ngày',
  },
};

const GlobeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export function RiskSettingsPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];
  const { resetPreferences } = useRiskPreferencesStore();

  const handleResetAll = () => {
    if (window.confirm(t.btnResetConfirm)) {
      resetPreferences();
    }
  };

  return (
    <div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
      <div className="pt-24 pb-8 px-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium tracking-wider uppercase mb-1" style={{ color: COLORS.onSurfaceVariant }}>
                {t.eyebrow}
              </p>
              <h1 className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>
                {t.title}
              </h1>
              <p className="text-sm mt-1" style={{ color: COLORS.onSurfaceVariant }}>
                {t.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
                style={{
                  backgroundColor: COLORS.surface,
                  border: `1px solid ${COLORS.outline}`,
                  color: COLORS.onSurface,
                }}
                aria-label="Toggle language"
              >
                <GlobeIcon />
                {t.langToggle}
              </button>
              <button
                onClick={handleResetAll}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                style={{
                  backgroundColor: `${COLORS.loss}22`,
                  border: `1px solid ${COLORS.loss}`,
                  color: COLORS.loss,
                }}
              >
                {t.btnReset}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StitchCard className="overflow-hidden">
              <StitchCardBody>
                <AutoCloseForm />
              </StitchCardBody>
            </StitchCard>

            <StitchCard className="overflow-hidden">
              <StitchCardBody>
                <CircuitBreakerForm />
              </StitchCardBody>
            </StitchCard>
          </div>

          <StitchCard className="overflow-hidden">
            <StitchCardBody>
              <NotificationPreferencesForm />
            </StitchCardBody>
          </StitchCard>

          <div
            className="p-4 rounded-2xl border"
            style={{
              backgroundColor: `${COLORS.primary}0D`,
              borderColor: `${COLORS.primary}33`,
            }}
          >
            <div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
              <strong className="block mb-1" style={{ color: COLORS.primary }}>
                {t.infoTitle}
              </strong>
              {t.infoBody}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
