import { CandlestickChart } from './candlestick-chart';
import { ShardRingMonitor } from './shard-ring-monitor';
import { StitchCard } from './ui/stitch-card';

interface DashboardCockpitProps {
  className?: string;
  onRefresh?: () => void;
}

export function DashboardCockpit({ className = '' }: DashboardCockpitProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Cockpit Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-obsidian-card/80 backdrop-blur-xl border border-white/5 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
            <span className="font-semibold text-white tracking-wide uppercase text-[11px]">
              Cockpit Matrix
            </span>
          </div>
          <span className="text-white/20">|</span>
          <span className="text-muted font-mono text-[11px]">
            Ring: <span className="text-primary font-semibold">12 Shards (Balanced)</span>
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-muted">Latency:</span>
            <span className="text-profit">12ms</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted">Sync:</span>
            <span className="text-accent">99.99%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted">DO Cluster:</span>
            <span className="px-1.5 py-0.5 rounded bg-white/5 text-white">Active</span>
          </div>
        </div>
      </div>

      {/* Main Cockpit Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Candlestick Chart (TradingView lightweight-charts) */}
        <StitchCard className="lg:col-span-8 p-4 flex flex-col min-h-[420px]">
          <CandlestickChart />
        </StitchCard>

        {/* Shard Ring Topology & TradingView Telemetry */}
        <StitchCard className="lg:col-span-4 p-4 flex flex-col justify-between min-h-[420px]">
          <ShardRingMonitor />
        </StitchCard>
      </div>
    </div>
  );
}

export default DashboardCockpit;
