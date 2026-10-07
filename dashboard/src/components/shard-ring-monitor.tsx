import { useDashboardStore } from '../stores/dashboard-store';
import { TOTAL_SHARDS } from '../../../src/durable-objects/shard-manager-types';
import { COLORS } from '../lib/stitch-design-tokens';
import { ShardRingChart } from './shard-ring-chart';

/**
 * Shard Ring Monitor
 * Visualizes the shard distribution ring (12 shards) for the system health overview.
 */
export function ShardRingMonitor() {
  const health = useDashboardStore((s) => s.health);
  // Simulated chart data
  const chartData = Array.from({ length: 20 }, (_, i) => ({
    time: new Date(Date.now() - (20 - i) * 60000).toISOString().split('T')[1].substring(0, 5),
    value: 50 + Math.random() * 50,
  }));

  const shards = Array.from({ length: TOTAL_SHARDS }, (_, i) => {
    const shardHealth = health?.shards?.find((s) => s.shardId === i);
    return {
      id: i,
      status: shardHealth?.status || 'healthy',
      rps: shardHealth?.rps || Math.floor(Math.random() * 100),
    };
  });

  return (
    <div className="flex flex-col gap-3 h-full">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-onSurface">
        <span className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: COLORS.primary }} />
        Shard Health Ring (Live)
      </h3>
      <div className="flex items-center justify-center p-4">
        <div className="relative w-40 h-40 flex items-center justify-center">
          {shards.map((shard, i) => {
            const angle = (i / TOTAL_SHARDS) * 360 - 90;
            return (
              <div
                key={shard.id}
                className="absolute w-2 h-2 rounded-full transition-colors duration-500"
                style={{
                  transform: `rotate(${angle}deg) translate(75px) rotate(-${angle}deg)`,
                  backgroundColor:
                    shard.status === 'healthy'
                      ? COLORS.profit
                      : shard.status === 'degraded'
                      ? COLORS.warning
                      : COLORS.loss,
                }}
                title={`Shard ${shard.id}: ${shard.status}`}
              />
            );
          })}
          <div className="text-center">
            <div className="text-xl font-mono text-primary tabular-nums">
              {shards.filter(s => s.status === 'healthy').length}/12
            </div>
            <div className="text-[9px] text-onSurfaceVariant uppercase">Nodes</div>
          </div>
        </div>
      </div>
      <div className="mt-auto pt-2 border-t border-white/5">
        <ShardRingChart data={chartData} height={80} />
      </div>
    </div>
  );
}
