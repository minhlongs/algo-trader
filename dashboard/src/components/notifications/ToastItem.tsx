/**
 * ToastItem — Individual toast notification
 */
import { useEffect } from 'react';
import type { Notification } from '../../stores/notifications-store';
import { COLORS } from '../../lib/stitch-design-tokens';

interface ToastItemProps {
  notification: Notification;
  onClose: () => void;
}

export function ToastItem({ notification, onClose }: ToastItemProps) {
  const { type, severity, title, message } = notification;

  // Auto-dismiss after duration if set
  useEffect(() => {
    if (notification.duration && notification.duration > 0) {
      const timer = setTimeout(onClose, notification.duration);
      return () => clearTimeout(timer);
    }
  }, [notification.duration, onClose]);

  const getBorderColor = () => {
    switch (type) {
      case 'success':
        return COLORS.profit;
      case 'warning':
        return COLORS.warning;
      case 'error':
        return COLORS.loss;
      default:
        return COLORS.primary;
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return 'check_circle';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'info';
    }
  };

  return (
    <div
      className="rounded-lg border p-3 shadow-lg flex items-start gap-3 relative"
      style={{
        backgroundColor: COLORS.surfaceHigh,
        borderColor: getBorderColor(),
        color: COLORS.onSurface,
        minWidth: '300px',
        maxWidth: '400px',
      }}
      role="alert"
    >
      <span
        className="text-xl leading-none"
        style={{ fontFamily: 'Material Symbols Outlined', color: getBorderColor() }}
      >
        {getIcon()}
      </span>
      <div className="flex-1 min-w-0">
        {title && (
          <div className="text-sm font-bold mb-0.5" style={{ color: COLORS.onSurface }}>
            {title}
          </div>
        )}
        <div className="text-xs break-words" style={{ color: COLORS.onSurfaceVariant }}>
          {message}
        </div>
        <div className="text-[10px] mt-1 opacity-60" style={{ color: COLORS.onSurfaceVariant }}>
          {severity.toUpperCase()}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-lg opacity-70 hover:opacity-100 leading-none"
        style={{ color: COLORS.onSurfaceVariant }}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
