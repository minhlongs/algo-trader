/**
 * LeaderboardTable
 *
 * Sortable strategy leaderboard table.
 * Columns: Rank, Strategy, Win Rate, Sharpe, P&L, Drawdown, Trades, Badge.
 * Click column header to sort asc/desc. Top 3 highlighted with gold/silver/bronze.
 */
import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import type { LeaderboardEntry } from '../../types/api';
import { LeaderboardRow } from './leaderboard-row';

type SortKey = keyof Pick<
  LeaderboardEntry,
  'rank' | 'strategy' | 'winRate' | 'sharpe' | 'pnl' | 'drawdown' | 'trades'
>;

type SortDir = 'asc' | 'desc';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
}

function SortIcon({ dir }: { dir: SortDir | null }) {
  if (!dir) {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-muted/40">
        <path d="M5 1L8 4H2L5 1ZM5 9L2 6H8L5 9Z" />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-accent">
      {dir === 'asc'
        ? <path d="M5 1L8 5H2L5 1Z" />
        : <path d="M5 9L2 5H8L5 9Z" />}
    </svg>
  );
}

const COLUMNS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'rank', label: 'Rank' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'winRate', label: 'Win Rate', align: 'right' },
  { key: 'sharpe', label: 'Sharpe', align: 'right' },
  { key: 'pnl', label: 'P&L', align: 'right' },
  { key: 'drawdown', label: 'Drawdown', align: 'right' },
  { key: 'trades', label: 'Trades', align: 'right' },
];

export function LeaderboardTable({ entries }: LeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' || key === 'strategy' ? 'asc' : 'desc');
    }
  }

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [entries, sortKey, sortDir]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted">
        <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24" className="mb-3 opacity-30">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="9" x2="9" y2="21" />
        </svg>
        <p className="text-sm">No leaderboard data available</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="overflow-x-auto"
    >
      <table className="w-full min-w-[750px] text-xs border-collapse">
        <thead>
          <tr className="border-b border-bg-border">
            {COLUMNS.map(({ key, label, align }) => (
              <th
                key={key}
                onClick={() => handleSort(key)}
                className={`
                  px-3 py-2 text-muted cursor-pointer select-none
                  hover:text-white transition-colors whitespace-nowrap text-[10px] uppercase tracking-widest
                  ${align === 'right' ? 'text-right' : 'text-left'}
                `}
              >
                <span className="inline-flex items-center gap-1">
                  {label}
                  <SortIcon dir={sortKey === key ? sortDir : null} />
                </span>
              </th>
            ))}
            <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted text-left">
              Badge
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, idx) => (
            <LeaderboardRow
              key={entry.strategy}
              entry={entry}
              isTop3={idx < 3}
            />
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}
