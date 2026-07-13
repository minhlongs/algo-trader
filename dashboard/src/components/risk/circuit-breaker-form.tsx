/**
 * CircuitBreakerForm — Configure circuit breaker risk rules
 */
import { useState } from 'react';
import { useRiskPreferencesStore } from '../../stores/risk-preferences-store';
import { StitchInput, StitchButton, StitchCard, StitchCardBody } from '../ui/stitch-components';
import { COLORS } from '../../lib/stitch-design-tokens';

export function CircuitBreakerForm() {
  const preferences = useRiskPreferencesStore((s) => s);
  const { circuitBreakerEnabled, maxConsecutiveLosses, cooldownPeriodMinutes, maxDrawdownPercent } = preferences;
  const [localDrawdown, setLocalDrawdown] = useState((maxDrawdownPercent * 100).toFixed(1));
  const [localConsecutive, setLocalConsecutive] = useState(maxConsecutiveLosses.toString());
  const [localCooldown, setLocalCooldown] = useState(cooldownPeriodMinutes.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (): boolean => {
    const drawdown = parseFloat(localDrawdown);
    if (isNaN(drawdown) || drawdown <= 0 || drawdown > 100) {
      setError('Max drawdown must be between 0 and 100%');
      return false;
    }
    const consecutive = parseInt(localConsecutive, 10);
    if (isNaN(consecutive) || consecutive <= 0) {
      setError('Consecutive losses must be a positive number');
      return false;
    }
    const cooldown = parseInt(localCooldown, 10);
    if (isNaN(cooldown) || cooldown <= 0) {
      setError('Cooldown period must be a positive number of minutes');
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
        circuitBreakerEnabled: true,
        maxDrawdownPercent: parseFloat(localDrawdown) / 100,
        maxConsecutiveLosses: parseInt(localConsecutive, 10),
        cooldownPeriodMinutes: parseInt(localCooldown, 10),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setLocalDrawdown((preferences.maxDrawdownPercent * 100).toFixed(1));
    setLocalConsecutive(preferences.maxConsecutiveLosses.toString());
    setLocalCooldown(preferences.cooldownPeriodMinutes.toString());
    setError(null);
  };

  return (
    <StitchCard className="overflow-hidden">
      <StitchCardBody>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold" style={{ color: COLORS.onSurface }}>
              Enable Circuit Breaker
            </label>
            <input
              type="checkbox"
              checked={circuitBreakerEnabled}
              onChange={(e) => preferences.updatePreferences({ circuitBreakerEnabled: e.target.checked })}
              className="w-4 h-4 accent-[${COLORS.primary}]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StitchInput
              label="Max Drawdown (%)"
              value={localDrawdown}
              onChange={setLocalDrawdown}
              type="number"
              min="0"
              max="100"
              step="0.1"
              disabled={!circuitBreakerEnabled}
            />
            <StitchInput
              label="Consecutive Losses"
              value={localConsecutive}
              onChange={setLocalConsecutive}
              type="number"
              min="1"
              step="1"
              disabled={!circuitBreakerEnabled}
            />
            <StitchInput
              label="Cooldown (minutes)"
              value={localCooldown}
              onChange={setLocalCooldown}
              type="number"
              min="1"
              step="1"
              disabled={!circuitBreakerEnabled}
            />
          </div>

          {error && (
            <div className="text-xs p-2 rounded" style={{ backgroundColor: `${COLORS.loss}1A`, color: COLORS.loss }}>
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <StitchButton onClick={handleSave} disabled={!circuitBreakerEnabled || saving} variant="primary">
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
