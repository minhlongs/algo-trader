/**
 * ProactiveControlsPanel — Consolidated panel for auto-close and circuit breaker rules
 * Shows real-time status and integrates with NegRiskScannerStore
 */
import { useRiskPreferencesStore } from '../../stores/risk-preferences-store';
import { useTradingStore } from '../../stores/trading-store';
import { AutoCloseForm } from './auto-close-form';
import { CircuitBreakerForm } from './circuit-breaker-form';
import { StitchCard, StitchCardHeader, StitchCardBody } from '../ui/stitch-card';
import { COLORS } from '../../lib/stitch-design-tokens';

export function ProactiveControlsPanel() {
  const preferences = useRiskPreferencesStore();
  const positions = useTradingStore((s) => s.positions);
  const openPositions = positions.filter((p) => p.status === 'open');
  const totalExposure = openPositions.reduce((sum, p) => sum + p.pnl, 0);

  const autoCloseActive = preferences.autoCloseEnabled;
  const circuitBreakerActive = preferences.circuitBreakerEnabled;

  return (
    <StitchCard>
      <StitchCardHeader>
        <div className="flex items-center justify-between w-full">
          <h3 className="text-sm font-bold" style={{ color: COLORS.onSurface }}>
            Proactive Controls
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
              Auto-Close:
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                autoCloseActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {autoCloseActive ? 'ACTIVE' : 'INACTIVE'}
            </span>
            <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
              Circuit Breaker:
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                circuitBreakerActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {circuitBreakerActive ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>
        </div>
      </StitchCardHeader>
      <StitchCardBody>
        <div className="space-y-6">
          {/* Real-time metrics */}
          <div className="grid grid-cols-2 gap-4 p-3 rounded" style={{ backgroundColor: `${COLORS.surfaceHigh}33` }}>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>
                Open Positions
              </div>
              <div className="text-lg font-mono" style={{ color: COLORS.onSurface }}>
                {openPositions.length}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>
                Total P&L
              </div>
              <div
                className="text-lg font-mono"
                style={{ color: totalExposure >= 0 ? COLORS.profit : COLORS.loss }}
              >
                {totalExposure >= 0 ? '+' : ''}${totalExposure.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Forms */}
          <div className="space-y-4">
            <AutoCloseForm />
            <CircuitBreakerForm />
          </div>
        </div>
      </StitchCardBody>
    </StitchCard>
  );
}
