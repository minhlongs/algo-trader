/**
 * Confirmation Dialog — reusable modal for destructive or confirmable actions.
 */
import type { ReactNode } from 'react';

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  if (!open) return null;

  const confirmColors =
    variant === 'danger'
      ? 'bg-loss text-white hover:bg-loss/80'
      : 'bg-accent text-bg hover:bg-accent/80';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="bg-bg-surface border border-bg-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-sm">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="text-xs text-muted">{message}</div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold text-muted border border-bg-border rounded hover:text-white hover:border-muted/50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-bold rounded transition-colors ${confirmColors}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmationDialog;
