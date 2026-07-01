/**
 * Subscription Detail Card — renders a single marketplace subscription with
 * metadata, P&L, execution history, and action buttons (pause/resume/cancel/execute).
 */
import type { MarketplaceSubscription } from '../types/api';

export interface ExecutionRecord {
  timestamp: number;
  signal?: string;
  profit?: number;
  error?: string;
  [key: string]: unknown;
}

export interface SubscriptionDetailProps {
  subscription: MarketplaceSubscription;
  strategyName: string;
  /** Map of subscriptionId → last execution record */
  executionHistory: Map<string, ExecutionRecord>;
  /** Which subscription is currently executing, or null */
  isExecuting: boolean;
  onPauseResume: (sub: MarketplaceSubscription) => void;
  onCancel: (sub: MarketplaceSubscription) => void;
  onExecute: (sub: MarketplaceSubscription) => void;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  cancelled: 'Cancelled',
  pending_payment: 'Payment Pending',
};

function statusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'text-profit border-profit/30 bg-profit/10';
    case 'paused':
      return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
    case 'cancelled':
      return 'text-loss border-loss/30 bg-loss/10';
    case 'pending_payment':
      return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
    default:
      return 'text-muted border-bg-border bg-bg-border/30';
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SubscriptionDetail({
  subscription,
  strategyName,
  executionHistory,
  isExecuting,
  onPauseResume,
  onCancel,
  onExecute,
}: SubscriptionDetailProps) {
  const lastExec = executionHistory.get(subscription.id);
  const statusLabel = STATUS_LABELS[subscription.status] ?? subscription.status;

  return (
    <div
      className={`bg-bg-surface border rounded-lg p-4 flex flex-col gap-3 ${
        subscription.status === 'active' ? 'border-accent/30' : 'border-bg-border'
      }`}
    >
      {/* Header: name + status badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-xs">{strategyName}</span>
          <span
            className={`text-[10px] border px-1.5 py-0.5 rounded font-medium ${statusColor(
              subscription.status,
            )}`}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 border-t border-bg-border pt-2.5">
        <div className="text-[10px]">
          <span className="text-muted">Subscribed</span>
          <span className="text-white block">
            {subscription.subscriptionStartedAt
              ? formatDate(subscription.subscriptionStartedAt)
              : '—'}
          </span>
        </div>
        <div className="text-[10px]">
          <span className="text-muted">Allocation</span>
          <span className="text-white block">{subscription.allocationPercent}%</span>
        </div>
        <div className="text-[10px]">
          <span className="text-muted">Invested</span>
          <span className="text-white block">
            {formatCents(subscription.currentInvestmentUsd)}
          </span>
        </div>
        <div className="text-[10px]">
          <span className="text-muted">Running P&L</span>
          <span
            className={`block font-bold ${
              subscription.totalPnlUsd >= 0 ? 'text-profit' : 'text-loss'
            }`}
          >
            {formatCents(subscription.totalPnlUsd)}
          </span>
        </div>
      </div>

      {/* Last execution */}
      {lastExec && (
        <div className="border-t border-bg-border pt-2.5">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-muted">Last execution: {formatTime(lastExec.timestamp)}</span>
            {lastExec.signal && (
              <span className="text-accent font-bold">{lastExec.signal}</span>
            )}
            {lastExec.profit !== undefined && (
              <span
                className={lastExec.profit >= 0 ? 'text-profit font-bold' : 'text-loss font-bold'}
              >
                {formatCents(lastExec.profit)}
              </span>
            )}
            {lastExec.error && (
              <span className="text-loss" title={lastExec.error}>
                Failed
              </span>
            )}
          </div>
        </div>
      )}

      {/* Extra status info */}
      {subscription.pausedAt && subscription.status === 'paused' && (
        <div className="text-[10px] text-yellow-400">
          Paused since {formatDate(subscription.pausedAt)}
        </div>
      )}
      {subscription.cancelledAt && subscription.status === 'cancelled' && (
        <div className="text-[10px] text-muted">
          Cancelled {formatDate(subscription.cancelledAt)}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1.5">
        {subscription.status === 'active' && (
          <>
            <button
              type="button"
              onClick={() => onExecute(subscription)}
              disabled={isExecuting}
              className="px-3 py-1.5 text-[10px] font-bold bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 disabled:opacity-50 transition-colors"
            >
              {isExecuting ? 'Executing...' : 'Execute'}
            </button>
            <button
              type="button"
              onClick={() => onPauseResume(subscription)}
              className="px-3 py-1.5 text-[10px] font-bold text-yellow-400 border border-yellow-400/30 rounded hover:bg-yellow-400/10 transition-colors"
            >
              Pause
            </button>
          </>
        )}
        {subscription.status === 'paused' && (
          <>
            <button
              type="button"
              onClick={() => onPauseResume(subscription)}
              className="px-3 py-1.5 text-[10px] font-bold text-profit border border-profit/30 rounded hover:bg-profit/10 transition-colors"
            >
              Resume
            </button>
          </>
        )}
        {(subscription.status === 'active' || subscription.status === 'paused') && (
          <button
            type="button"
            onClick={() => onCancel(subscription)}
            className="px-3 py-1.5 text-[10px] font-bold text-loss border border-loss/30 rounded hover:bg-loss/10 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default SubscriptionDetail;
