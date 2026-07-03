/**
 * Co-pilot action buttons — rendered as pill buttons below bot messages.
 *
 * Action types:
 * - navigate: Navigate to a page (data contains the route)
 * - refresh: Re-run the query
 * - copy: Copy response text to clipboard
 * - acknowledge: Dismiss a warning/message
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActionButton } from '../../stores/co-pilot-store';

interface Props {
  actions: ActionButton[];
  /** Content to copy when action is 'copy' */
  content?: string;
  onRefresh?: () => void;
  onAcknowledge?: () => void;
}

export function CoPilotActions({ actions, content, onRefresh, onAcknowledge }: Props) {
  const navigate = useNavigate();

  const handleAction = useCallback(
    (action: ActionButton) => {
      switch (action.action) {
        case 'navigate':
          if (action.data) {
            navigate(action.data);
          }
          break;
        case 'refresh':
          onRefresh?.();
          break;
        case 'copy':
          if (content) {
            navigator.clipboard.writeText(content).catch(() => {});
          }
          break;
        case 'acknowledge':
          onAcknowledge?.();
          break;
        default:
          break;
      }
    },
    [navigate, content, onRefresh, onAcknowledge]
  );

  return (
    <div className="flex flex-wrap gap-2 px-4 pb-2">
      {actions.map((action, idx) => (
        <button
          key={`${action.action}-${idx}`}
          onClick={() => handleAction(action)}
          className="px-3 py-1.5 text-xs font-semibold rounded-full border border-accent/30 text-accent bg-accent/10 hover:bg-accent/20 hover:border-accent/50 transition-all duration-150 whitespace-nowrap"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
