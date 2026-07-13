/**
 * AutoCloseForm — Configure auto-close risk rules
 */
import { useState } from 'react';
import { useRiskPreferencesStore } from '../../stores/risk-preferences-store';
import { StitchInput, StitchButton, StitchCard, StitchCardBody } from '../ui/stitch-components';
import { COLORS } from '../../lib/stitch-design-tokens';

export function AutoCloseForm() {
  const preferences = useRiskPreferencesStore((s) => s);
  const { autoCloseEnabled, profitTargetPercent, stopLossPercent, trailingStopPercent } = preferences;
  const [localProfit, setLocalProfit] = useState((profitTargetPercent * 100).toFixed(1));
  const [localStop, setLocalStop] = useState((stopLossPercent * 100).toFixed(1));
  const [localTrailing, setLocalTrailing] = useState((trailingStopPercent * 100).toFixed(1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (): boolean => {
    const profit = parseFloat(localProfit);
    const stop = parseFloat(localStop);
    if (isNaN(profit) || profit <= 0 || profit > 100) {
      setError('Profit target must be between 0 and 100%');
      return false;
    }
    if (isNaN(stop) || stop <= 0 || stop > 100) {
      setError('Stop loss must be between 0 and 100%');
      return false;
    }
    if (profit <= stop) {
      setError('Profit target must be greater than stop loss');
      return false;
    }
    const trailing = parseFloat(localTrailing);
    if (isNaN(trailing) || trailing < 0 || trailing > 100) {
      setError('Trailing stop must be between 0 and 100%');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      preferences.updatePreferences({
        autoCloseEnabled: true,
        profitTargetPercent: parseFloat(localProfit) / 100,
        stopLossPercent: parseFloat(localStop) / 100,
        trailingStopPercent: parseFloat(localTrailing) / 100,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setLocalProfit((preferences.profitTargetPercent * 100).toFixed(1));
    setLocalStop((preferences.stopLossPercent * 100).toFixed(1));
    setLocalTrailing((preferences.trailingStopPercent * 100).toFixed(1));
    setError(null);
  };

  return (
    <StitchCard className="overflow-hidden">
      <StitchCardBody>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold" style={{ color: COLORS.onSurface }}>
              Enable Auto-Close
            </label>
            <input
              type="checkbox"
              checked={autoCloseEnabled}
              onChange={(e) => preferences.updatePreferences({ autoCloseEnabled: e.target.checked })}
              className="w-4 h-4 accent-[${COLORS.primary}]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StitchInput
              label="Profit Target (%)"
              value={localProfit}
              onChange={setLocalProfit}
              type="number"
              min="0"
              max="100"
              step="0.1"
              disabled={!autoCloseEnabled}
            />
            <StitchInput
              label="Stop Loss (%)"
              value={localStop}
              onChange={setLocalStop}
              type="number"
              min="0"
              max="100"
              step="0.1"
              disabled={!autoCloseEnabled}
            />
            <StitchInput
              label="Trailing Stop (%)"
              value={localTrailing}
              onChange={setLocalTrailing}
              type="number"
              min="0"
              max="100"
              step="0.1"
              disabled={!autoCloseEnabled}
            />
          </div>

          {error && (
            <div className="text-xs p-2 rounded" style={{ backgroundColor: `${COLORS.loss}1A`, color: COLORS.loss }}>
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <StitchButton onClick={handleSave} disabled={!autoCloseEnabled || saving} variant="primary">
              {saving ? 'Saving...' : 'Save Settings'}
            </StitchButton>
            <StitchButton onClick={handleReset} variant="secondary" disabled={saving}>
              Reset
            </StitchButton>
          </div>
        </div>
      </StitchCardBody>
    </StitchCard>
  );
}
