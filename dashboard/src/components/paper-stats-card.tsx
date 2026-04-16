/**
 * Paper-stats card — renders 4 headline numbers.
 * Prefers live `/api/stats` (D1 edge mirror); falls back to static
 * `/paper-stats.json` if the Pages Function is unavailable.
 * Polar-safe copy: avoids all flagged vocabulary.
 */
import { useEffect, useState } from 'react';

export interface PaperStats {
  trades: number;
  batches: number;
  edge_avg_pct: number;
  actionable_pct: number;
  last_updated: string;
  source: string;
  note: string;
}

const PLACEHOLDER: PaperStats = {
  trades: 0,
  batches: 0,
  edge_avg_pct: 0,
  actionable_pct: 0,
  last_updated: '—',
  source: 'paper',
  note: '',
};

async function loadStats(): Promise<PaperStats> {
  try {
    const live = await fetch('/api/stats', { cache: 'no-cache' });
    if (live.ok) {
      const data = (await live.json()) as PaperStats;
      if (data && typeof data.trades === 'number' && data.trades > 0) return data;
    }
  } catch {
    // fall through to static
  }
  const res = await fetch('/paper-stats.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as PaperStats;
}

function formatNumber(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function PaperStatsCard() {
  const [stats, setStats] = useState<PaperStats>(PLACEHOLDER);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStats()
      .then((data) => { if (!cancelled) setStats(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const items: Array<{ label: string; value: string }> = [
    { label: 'Paper trades', value: formatNumber(stats.trades) },
    { label: 'Batches', value: formatNumber(stats.batches) },
    { label: 'Avg pre-resolution edge', value: `${formatNumber(stats.edge_avg_pct, 1)}%` },
    { label: 'Actionable share', value: `${formatNumber(stats.actionable_pct)}%` },
  ];

  return (
    <section className="px-4 sm:px-6 max-w-5xl mx-auto pb-4">
      <div className="bg-[#1A1A2E] border border-[#2D3142] rounded-lg p-6">
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <p className="text-[#00D9FF] text-xs uppercase tracking-[0.2em] font-mono">
            Paper Run · Snapshot
          </p>
          <p className="text-[#8892B0] text-xs font-mono">
            as of {stats.last_updated}
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map(({ label, value }) => (
            <div key={label}>
              <p className="text-white text-2xl sm:text-3xl font-bold font-mono">
                {value}
              </p>
              <p className="text-[#8892B0] text-xs leading-snug mt-1">{label}</p>
            </div>
          ))}
        </div>
        {stats.note && (
          <p className="text-[#8892B0]/70 text-xs mt-4 italic">
            Note: {stats.note}. Accuracy claims pending live resolution.
          </p>
        )}
        {error && (
          <p className="text-[#FF3366] text-xs mt-3 font-mono">
            Stats unavailable ({error}) — showing placeholder.
          </p>
        )}
      </div>
    </section>
  );
}
