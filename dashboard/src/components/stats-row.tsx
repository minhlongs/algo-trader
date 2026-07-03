/**
 * Stats Row Component - 4 stat cards for dashboard
 * Displays: Total Equity, Open Positions, Today's P&L, Active Strategies
 */
import { motion } from 'motion/react';
import type { PerformanceMetrics } from '../types/api';
import { useTranslation } from 'react-i18next';

interface StatsRowProps {
  totalEquity?: number;
  openPositions?: number;
  todayPnl?: number;
  activeStrategies?: number;
  metrics?: PerformanceMetrics | null;
}

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1000
    ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : abs.toFixed(2);
  return (n < 0 ? '-' : '') + '$' + s;
}

export function StatsRow({ totalEquity, openPositions, todayPnl, activeStrategies, metrics }: StatsRowProps) {
  const { t } = useTranslation();
  const pnlValue = todayPnl ?? metrics?.dailyPnl ?? 0;
  const pnlPositive = pnlValue >= 0;

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  const containerVariants = {
    visible: {
      transition: { staggerChildren: 0.1 },
    },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
    >
      {/* Total Equity */}
      <motion.div
        variants={cardVariants}
        transition={{ duration: 0.3 }}
        viewport={{ once: true }}
        whileHover={{ scale: 1.02 }}
        className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg p-4 hover:border-accent/30 transition-all duration-300 group"
      >
        <p className="text-muted text-[10px] uppercase tracking-widest mb-1 font-mono">{t('dashboard.totalEquity')}</p>
        <p className="text-xl font-bold text-white font-mono tabular-nums">
          {totalEquity ? formatUsd(totalEquity) : '—'}
        </p>
        <div className="mt-2 h-1 bg-bg-border rounded-full overflow-hidden">
          <div className="h-full bg-accent/60 rounded-full" style={{ width: '75%' }} />
        </div>
      </motion.div>

      {/* Open Positions */}
      <motion.div
        variants={cardVariants}
        transition={{ duration: 0.3 }}
        viewport={{ once: true }}
        whileHover={{ scale: 1.02 }}
        className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg p-4 hover:border-accent/30 transition-all duration-300 group"
      >
        <p className="text-muted text-[10px] uppercase tracking-widest mb-1 font-mono">{t('dashboard.openPositionsLabel')}</p>
        <p className="text-xl font-bold text-white font-mono tabular-nums">
          {openPositions ?? '—'}
        </p>
        <p className="text-[10px] text-muted mt-2 font-mono">{t('dashboard.marginUsage')}</p>
      </motion.div>

      {/* Today's P&L */}
      <motion.div
        variants={cardVariants}
        transition={{ duration: 0.3 }}
        viewport={{ once: true }}
        whileHover={{ scale: 1.02 }}
        className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg p-4 hover:border-accent/30 transition-all duration-300 group"
      >
        <p className="text-muted text-[10px] uppercase tracking-widest mb-1 font-mono">{t('dashboard.todayPnl')}</p>
        <p className={`text-xl font-bold font-mono tabular-nums ${pnlPositive ? 'text-profit' : 'text-loss'}`}>
          {formatUsd(pnlValue)}
        </p>
        <div className="mt-2 flex gap-1">
          <div className={`h-1 flex-1 rounded-full ${pnlPositive ? 'bg-profit/80' : 'bg-loss/80'}`} />
          <div className={`h-1 flex-1 rounded-full ${pnlPositive ? 'bg-profit/60' : 'bg-loss/60'}`} />
          <div className={`h-1 flex-1 rounded-full ${pnlPositive ? 'bg-profit/40' : 'bg-loss/40'}`} />
          <div className="h-1 flex-1 rounded-full bg-bg-border" />
          <div className="h-1 flex-1 rounded-full bg-bg-border" />
        </div>
      </motion.div>

      {/* Active Strategies */}
      <motion.div
        variants={cardVariants}
        transition={{ duration: 0.3 }}
        viewport={{ once: true }}
        whileHover={{ scale: 1.02 }}
        className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg p-4 hover:border-accent/30 transition-all duration-300 group"
      >
        <p className="text-muted text-[10px] uppercase tracking-widest mb-1 font-mono">{t('dashboard.activeStrategies')}</p>
        <p className="text-xl font-bold text-accent font-mono tabular-nums">
          {activeStrategies ?? '—'}
        </p>
        <p className="text-[10px] text-profit mt-2 font-mono">{t('dashboard.systemHealth')}</p>
      </motion.div>
    </motion.div>
  );
}
