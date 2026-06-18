/**
 * Dashboard header section.
 */
import { useState, useEffect } from 'react';
import { useDashboardWebSocket } from '../hooks/use-dashboard-websocket';
import { CacheStatus } from '../components/cache-status';
import { StitchBadge } from '../components/ui/stitch-components';
import { COLORS } from '../lib/stitch-design-tokens';

export function DashboardHeader() {
  const { connected: wsConnected, latency, error: wsError, reconnectCount } = useDashboardWebSocket();

  function useNow(): string {
    const [now, setNow] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));
    useEffect(() => {
      const id = setInterval(() => setNow(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
      return () => clearInterval(id);
    }, []);
    return now;
  }

  const lastUpdate = useNow();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold tracking-tight" style={{ color: COLORS.onSurface }}>Dashboard</h2>
        <p className="text-xs mt-0.5" style={{ color: COLORS.onSurfaceVariant }}>
          Algo Trader RaaS Pro Max • {wsConnected ? 'Connected' : 'Disconnected'}
          {latency.avgLatency > 0 && ` • ${latency.avgLatency}ms latency`}
        </p>
        {wsError && <p className="text-loss text-xs mt-1">{wsError}</p>}
        {reconnectCount > 0 && (
          <p className="text-xs mt-0.5" style={{ color: COLORS.onSurfaceVariant }}>Reconnected {reconnectCount}x</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <CacheStatus />
        <span className="text-xs" style={{ color: COLORS.onSurfaceVariant, fontFamily: 'JetBrains Mono' }}>
          Updated {lastUpdate}
        </span>
        <StitchBadge label={wsConnected ? 'Live' : 'Offline'} tone={wsConnected ? 'profit' : 'loss'} />
      </div>
    </div>
  );
}
