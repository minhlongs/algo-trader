/* CashClaw — Shared formatting utilities
 * All display formatting in one place. Used by dashboard and landing pages.
 */

/**
 * Format a number as USD currency.
 * formatUsd(123.456) → "$123.46"
 * formatUsd(-50) → "-$50.00"
 * formatUsd(null | undefined | NaN) → "—"
 */
export function formatUsd(value) {
  if (value === null || value === undefined) return '—';
  let num;
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
 * Format a decimal as a percentage.
 * formatPct(0.1234) → "12.34%"
 * formatPct(null | undefined | NaN) → "—"
 */
export function formatPct(value) {
  if (value === null || value === undefined) return '—';
  let num;
  try {
    num = typeof value === 'number' ? value : Number(value);
  } catch {
    return '—';
  }
  if (Number.isNaN(num)) return '—';

  return `${(num * 100).toFixed(2)}%`;
}

export const formatPercent = formatPct;

/**
 * Format P&L with sign and color class name.
 * Returns { text, className } for easy DOM insertion.
 * formatPnl(50.25) → { text: "+$50.25", className: "cc-pnl--positive" }
 * formatPnl(-12.30) → { text: "-$12.30", className: "cc-pnl--negative" }
 */
export function formatPnl(value) {
  if (value === null || value === undefined) {
    return { text: '—', className: 'cc-pnl--zero' };
  }
  let num;
  try {
    num = typeof value === 'number' ? value : Number(value);
  } catch {
    return { text: '—', className: 'cc-pnl--zero' };
  }
  if (Number.isNaN(num)) {
    return { text: '—', className: 'cc-pnl--zero' };
  }

  const usd = formatUsd(num);
  if (usd === '$0.00') {
    return { text: '$0.00', className: 'cc-pnl--zero' };
  }
  if (num > 0) {
    return { text: `+${usd}`, className: 'cc-pnl--positive' };
  }
  if (num < 0) {
    return { text: usd, className: 'cc-pnl--negative' };
  }
  return { text: '$0.00', className: 'cc-pnl--zero' };
}

/**
 * Format a Brier score to 3 decimal places.
 * formatBrier(0.182) → "0.182"
 * formatBrier(null | undefined | NaN) → "—"
 */
export function formatBrier(value) {
  if (value === null || value === undefined) return '—';
  let num;
  try {
    num = typeof value === 'number' ? value : Number(value);
  } catch {
    return '—';
  }
  if (Number.isNaN(num)) return '—';
  return num.toFixed(3);
}

/**
 * Relative time string from a timestamp.
 * timeAgo(Date.now() - 120000) → "2m ago"
 */
export function timeAgo(timestamp) {
  if (!timestamp) return '—';
  let ts;
  try {
    ts = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  } catch {
    return '—';
  }
  if (Number.isNaN(ts) || ts <= 0) return '—';

  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
