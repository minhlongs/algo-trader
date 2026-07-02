/**
 * Strategy Allocation Donut Chart
 *
 * Recharts PieChart with donut hole showing active strategy capital allocation.
 * Features 8 distinct colors, clickable legend, and detail panel for selected item.
 */
import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface AllocationItem {
  name: string;
  value: number;
}

interface StrategyAllocationChartProps {
  data: AllocationItem[];
  loading: boolean;
}

/* ------------------------------------------------------------------ */
/*  Colors                                                            */
/* ------------------------------------------------------------------ */

const DONUT_COLORS = [
  '#00E676',
  '#F59E0B',
  '#FFB800',
  '#FF4466',
  '#7C3AED',
  '#F59E0B',
  '#3B82F6',
  '#EC4899',
];

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function StrategyAllocationChart({
  data,
  loading,
}: StrategyAllocationChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  /* Loading state */
  if (loading) {
    return (
      <div className="bg-bg-surface border border-bg-border rounded-lg p-4 space-y-3">
        <div className="h-4 w-32 bg-bg-border rounded animate-pulse" />
        <div className="h-[200px] w-full bg-bg-border rounded animate-pulse" />
      </div>
    );
  }

  /* Empty state */
  if (data.length === 0) {
    return (
      <div className="bg-bg-surface border border-bg-border rounded-lg p-6 text-center">
        <p className="text-muted text-sm">No active strategies</p>
        <p className="text-muted text-xs mt-1">
          Strategy allocation will appear once strategies are activated.
        </p>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  const selected = selectedIndex !== null ? data[selectedIndex] : null;

  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
      <h3 className="text-white text-sm font-semibold mb-4">
        Strategy Allocation
      </h3>

      <div className="flex flex-col items-center">
        {/* Donut chart */}
        <div className="h-[180px] w-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                dataKey="value"
                paddingAngle={2}
                stroke="none"
                onClick={(_entry: unknown, index: number) => {
                  setSelectedIndex(index === selectedIndex ? null : index);
                }}
                cursor="pointer"
              >
                {data.map((entry, idx) => (
                  <Cell
                    key={entry.name}
                    fill={DONUT_COLORS[idx % DONUT_COLORS.length]}
                    opacity={
                      selectedIndex === null || selectedIndex === idx ? 1 : 0.4
                    }
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Center summary label */}
        <div className="text-center -mt-6 mb-3">
          <p className="text-xs text-muted">Total</p>
          <p className="text-lg font-bold text-white">
            {data.length} strategies
          </p>
        </div>

        {/* Clickable legend grid */}
        <div className="w-full grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
          {data.map((item, idx) => {
            const pct = total > 0
              ? ((item.value / total) * 100).toFixed(1)
              : '0.0';
            const isSelected = selectedIndex === idx;
            return (
              <button
                key={item.name}
                onClick={() =>
                  setSelectedIndex(isSelected ? null : idx)
                }
                className={`flex items-center gap-2 text-left text-xs transition-colors ${
                  isSelected ? 'text-white' : 'text-muted hover:text-white'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor:
                      DONUT_COLORS[idx % DONUT_COLORS.length],
                  }}
                />
                <span className="truncate">{item.name}</span>
                <span className="font-mono ml-auto">{pct}%</span>
              </button>
            );
          })}
        </div>

        {/* Selected item detail */}
        {selected && (
          <div className="mt-3 w-full bg-bg border border-bg-border rounded p-2 text-xs">
            <p className="text-white font-medium">{selected.name}</p>
            <p className="text-muted mt-0.5">
              Allocation:{' '}
              {total > 0
                ? ((selected.value / total) * 100).toFixed(1)
                : '0.0'}
              % &middot; Value: {selected.value.toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
