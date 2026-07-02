/**
 * Subscriber Trade Table
 * Displays daily P&L breakdown rows for a single subscriber.
 * Sortable by date, netPnl, tradeCount, winRate.
 */

import { useState, useMemo } from 'react';

export interface SubscriberDailyPnL {
  date: string;
  netPnl: number;
  tradeCount: number;
  winRate: number;
}

interface SubscriberTradeTableProps {
  rows: SubscriberDailyPnL[];
  loading?: boolean;
}

type SortKey = keyof SubscriberDailyPnL;
type SortDir = 'asc' | 'desc';

function fmt(n: number, dec = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function pnlClass(v: number): string {
  return v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-muted';
}

interface ThProps {
  label: string;
  col: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (col: SortKey) => void;
}

function Th({ label, col, current, dir, onClick }: ThProps) {
  const active = col === current;
  return (
    <th
      className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted cursor-pointer select-none hover:text-accent transition-colors"
      onClick={() => onClick(col)}
    >
      {label}
      {active && <span className="ml-1 text-accent">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

export function SubscriberTradeTable({ rows, loading = false }: SubscriberTradeTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col);
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'string'
        ? av.localeCompare(bv as string)
        : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted text-xs">
        Loading trades...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-muted text-xs">
        No trade data for this period
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface/60 border-b border-border">
          <tr>
            <Th label="Date" col="date" current={sortKey} dir={sortDir} onClick={handleSort} />
            <Th label="Net P&L" col="netPnl" current={sortKey} dir={sortDir} onClick={handleSort} />
            <Th label="Trades" col="tradeCount" current={sortKey} dir={sortDir} onClick={handleSort} />
            <Th label="Win Rate" col="winRate" current={sortKey} dir={sortDir} onClick={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.date} className="border-b border-border/40 hover:bg-surface/40 transition-colors">
              <td className="px-3 py-2 text-white">{row.date}</td>
              <td className={`px-3 py-2 ${pnlClass(row.netPnl)}`}>
                {row.netPnl >= 0 ? '+' : ''}{fmt(row.netPnl, 4)}
              </td>
              <td className="px-3 py-2 text-white">{row.tradeCount}</td>
              <td className={`px-3 py-2 ${row.winRate >= 0.5 ? 'text-profit' : 'text-loss'}`}>
                {fmt(row.winRate * 100, 1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
