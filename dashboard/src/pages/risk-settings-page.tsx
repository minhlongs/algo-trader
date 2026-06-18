/**
 * RiskSettingsPage — Centralized risk management settings
 */
import { useRiskPreferencesStore } from '../stores/risk-preferences-store';
import { AutoCloseForm } from '../components/risk/auto-close-form';
import { CircuitBreakerForm } from '../components/risk/circuit-breaker-form';
import { NotificationPreferencesForm } from '../components/notifications/NotificationPreferencesForm';
import { StitchCard, StitchCardBody } from '../components/ui/stitch-card';
import { COLORS } from '../lib/stitch-design-tokens';

export function RiskSettingsPage() {
  const { resetPreferences } = useRiskPreferencesStore();

  const handleResetAll = () => {
    if (window.confirm('Are you sure you want to reset all risk settings to defaults?')) {
      resetPreferences();
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg, color: COLORS.onSurface }}>
      <div className="pt-24 pb-8 px-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>Risk Settings</h1>
            <button
              onClick={handleResetAll}
              className="px-4 py-2 rounded text-xs font-bold"
              style={{
                backgroundColor: `${COLORS.loss}22`,
                border: `1px solid ${COLORS.loss}`,
                color: COLORS.loss,
              }}
            >
              Reset All to Defaults
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Auto-Close Rules */}
            <StitchCard className="overflow-hidden">
              <StitchCardBody>
                <AutoCloseForm />
              </StitchCardBody>
            </StitchCard>

            {/* Circuit Breaker */}
            <StitchCard className="overflow-hidden">
              <StitchCardBody>
                <CircuitBreakerForm />
              </StitchCardBody>
            </StitchCard>
          </div>

          {/* Notification Preferences */}
          <StitchCard className="overflow-hidden">
            <StitchCardBody>
              <NotificationPreferencesForm />
            </StitchCardBody>
          </StitchCard>

          {/* Info Box */}
          <div
            className="p-4 rounded-lg border"
            style={{ backgroundColor: `${COLORS.primary}0D`, borderColor: `${COLORS.primary}33` }}
          >
            <div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
              <strong className="block mb-1" style={{ color: COLORS.primary }}>Risk Management Tips</strong>
              These settings control automated safeguards for your trading activity. Auto-close rules exit positions when profit targets or stop losses are hit. The circuit breaker halts trading after a series of losses or excessive drawdown. Notifications keep you informed of important events. Adjust these according to your risk tolerance.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
