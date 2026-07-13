/**
 * NotificationPreferencesForm — Configure alert channels and thresholds
 */
import { useNotificationsStore } from '../../stores/notifications-store';
import { StitchCard, StitchCardBody, StitchInput, StitchButton } from '../ui/stitch-components';
import { COLORS } from '../../lib/stitch-design-tokens';
import type { NotificationSeverity } from '../../stores/notifications-store';

export function NotificationPreferencesForm() {
  const { preferences, updatePreferences } = useNotificationsStore();

  const handleToggle = (key: keyof typeof preferences) => {
    if (typeof preferences[key] === 'boolean') {
      updatePreferences({ [key]: !preferences[key] });
    }
  };

  const handleSelectChange = (key: 'minSeverity' | 'maxVisibleToasts', value: string) => {
    if (key === 'minSeverity') {
      updatePreferences({ minSeverity: value as NotificationSeverity });
    } else {
      updatePreferences({ maxVisibleToasts: parseInt(value, 10) });
    }
  };

  return (
    <StitchCard className="overflow-hidden">
      <StitchCardBody>
        <div className="space-y-4">
          <h3 className="text-sm font-bold" style={{ color: COLORS.onSurface }}>Notification Preferences</h3>

          {/* Channel toggles */}
          <div className="space-y-2">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>Toast Notifications</span>
              <input
                type="checkbox"
                checked={preferences.toastEnabled}
                onChange={() => handleToggle('toastEnabled')}
                className="w-4 h-4 accent-[${COLORS.primary}]"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>Email Alerts</span>
              <input
                type="checkbox"
                checked={preferences.emailEnabled}
                onChange={() => handleToggle('emailEnabled')}
                className="w-4 h-4 accent-[${COLORS.primary}]"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>Sound Alerts</span>
              <input
                type="checkbox"
                checked={preferences.soundEnabled}
                onChange={() => handleToggle('soundEnabled')}
                className="w-4 h-4 accent-[${COLORS.primary}]"
              />
            </label>
          </div>

          <hr style={{ borderColor: `${COLORS.outline}4D` }} />

          {/* Severity threshold */}
          <div>
            <label className="block text-xs mb-2" style={{ color: COLORS.onSurfaceVariant }}>
              Minimum Severity
            </label>
            <select
              value={preferences.minSeverity}
              onChange={(e) => handleSelectChange('minSeverity', e.target.value)}
              className="w-full p-2 rounded text-sm"
              style={{
                backgroundColor: COLORS.surfaceHigh,
                borderColor: COLORS.outline,
                color: COLORS.onSurface,
              }}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Max visible toasts */}
          <div>
            <StitchInput
              label="Max Visible Toasts"
              type="number"
              min={1}
              max={10}
              value={String(preferences.maxVisibleToasts)}
              onChange={(val) => handleSelectChange('maxVisibleToasts', val)}
            />
          </div>

          <div className="pt-2">
            <StitchButton
              onClick={() => {
                // Reset to defaults could be added
              }}
              variant="secondary"
            >
              Reset to Defaults
            </StitchButton>
          </div>
        </div>
      </StitchCardBody>
    </StitchCard>
  );
}
