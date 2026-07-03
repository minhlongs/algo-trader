/**
 * Co-pilot FAB — floating action button for the AI Co-pilot chat.
 *
 * Fixed bottom-right position. Shows unread badge (number of bot responses
 * since last open). Pulse animation when there are unread messages.
 *
 * Keyboard shortcut: Ctrl+B toggles the chat panel.
 * (Ctrl+/ conflicts with browser shortcut menu; Ctrl+Shift+/ is awkward on mobile)
 */
import { useEffect, useState, useCallback } from 'react';
import { useCoPilotStore } from '../../stores/co-pilot-store';

export function CoPilotFab() {
  const { isOpen, toggleOpen, messages } = useCoPilotStore();
  const [unreadCount, setUnreadCount] = useState(0);

  // Track unread bot responses since last panel open
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    } else {
      const assistantCount = messages.filter((m) => m.role === 'assistant').length;
      setUnreadCount(assistantCount);
    }
  }, [isOpen, messages]);

  // Keyboard shortcut: Ctrl+B toggles chat panel
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl+B — avoid Ctrl+/ which conflicts with browser
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        // Don't interfere with native Ctrl+B (bold) in input fields
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        toggleOpen();
      }
    },
    [toggleOpen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <button
      onClick={toggleOpen}
      className={`
        fixed bottom-6 right-6 z-50
        flex items-center justify-center
        w-14 h-14 rounded-full
        bg-accent text-bg
        shadow-lg shadow-accent/30
        hover:shadow-xl hover:shadow-accent/40
        hover:scale-110 active:scale-95
        transition-all duration-200 ease-out
        ${!isOpen && unreadCount > 0 ? 'animate-pulse-soft' : ''}
      `}
      aria-label={isOpen ? 'Close AI Co-pilot' : 'Open AI Co-pilot'}
      title="AI Co-pilot (Ctrl+B)"
    >
      {isOpen ? (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      )}

      {/* Unread badge */}
      {!isOpen && unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-loss rounded-full shadow-lg">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
