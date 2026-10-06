/**
 * Standardized Financial Formatting Utilities
 * Strictly typed, locale-aware, and hardened against null/undefined/NaN values.
 * Compatible with src/ui/shared/format.js.
 */

/**
 * Format a number as USD currency with thousand separators.
 * formatUsd(1234.56) → "$1,234.56"
 * formatUsd(-50.2) → "-$50.20"
 * formatUsd(null | undefined | NaN) → "—"
 */
export function formatUsd(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  let num: number;
  try {
    num = typeof value === 'number' ? value : Number(value);
  } catch {
    return '—';
  }
  if (Number.isNaN(num)) return '—';

  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (formatted === '0.00') return '$0.00';
  return num < 0 ? `-$${formatted}` : `$${formatted}`;
}

export const formatCurrency = formatUsd;

/**
 * Format a decimal or ratio as a percentage.
 * formatPct(0.1234) → "12.34%"
 * formatPct(null | undefined | NaN) → "—"
 */
export function formatPct(value: number | string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return '—';
  let num: number;
  try {
    num = typeof value === 'number' ? value : Number(value);
  } catch {
    return '—';
  }
  if (Number.isNaN(num)) return '—';

  return `${(num * 100).toFixed(decimals)}%`;
}

export const formatPercent = formatPct;

/**
 * Format a number with thousand separators.
 * formatNumber(1234567) → "1,234,567"
 * formatNumber(null | undefined | NaN) → "—"
 */
export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  let num: number;
  try {
    num = typeof value === 'number' ? value : Number(value);
  } catch {
    return '—';
  }
  if (Number.isNaN(num)) return '—';

  return num.toLocaleString('en-US');
}

/**
 * Format P&L with sign prefix and standard badge class name.
 * formatPnl(50.25) → { text: "+$50.25", className: "text-profit" }
 * formatPnl(-12.30) → { text: "-$12.30", className: "text-loss" }
 */
export function formatPnl(value: number | string | null | undefined): { text: string; className: string } {
  if (value === null || value === undefined) {
    return { text: '—', className: 'text-muted' };
  }
  let num: number;
  try {
    num = typeof value === 'number' ? value : Number(value);
  } catch {
    return { text: '—', className: 'text-muted' };
  }
  if (Number.isNaN(num)) {
    return { text: '—', className: 'text-muted' };
  }

  const usd = formatUsd(num);
  if (usd === '$0.00') {
    return { text: '$0.00', className: 'text-muted' };
  }
  if (num > 0) {
    return { text: `+${usd}`, className: 'text-profit' };
  }
  if (num < 0) {
    return { text: usd, className: 'text-loss' };
  }
  return { text: '$0.00', className: 'text-muted' };
}
