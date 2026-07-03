/**
 * Co-pilot chat panel — slide-out panel from the right.
 *
 * Contains: header, scrollable messages, quick action chips, input bar.
 * Mounted in App.tsx outside <Routes> but inside <ErrorBoundary>.
 * Uses CSS transitions for slide-in/out animation.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useCoPilotStore, type ActionButton } from '../../stores/co-pilot-store';
import { CoPilotFab } from './co-pilot-fab';
import { CoPilotMessage, CoPilotTypingIndicator } from './co-pilot-message';
import { CoPilotActions } from './co-pilot-actions';
import { CoPilotInput } from './co-pilot-input';

const QUICK_ACTIONS = [
  { label: "What's my risk exposure?", action: 'quick' },
  { label: 'Find arb opportunities', action: 'quick' },
  { label: 'Market regime?', action: 'quick' },
  { label: 'Generate report', action: 'quick' },
] satisfies ActionButton[];

export function CoPilotChat() {
  const { isOpen, closePanel, messages, isLoading, sendQuery, retryLast, clearHistory } = useCoPilotStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Close panel on Escape key
  const handlePanelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePanel();
      }
    },
    [closePanel]
  );

  const handleQuickAction = useCallback(
    (action: ActionButton) => {
      sendQuery(action.label);
    },
    [sendQuery]
  );

  const handleRetry = useCallback(() => {
    retryLast();
  }, [retryLast]);

  return (
    <>
      <CoPilotFab />

      {/* Overlay (click to close) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity duration-300"
          onClick={closePanel}
          aria-hidden="true"
        />
      )}

      {/* Slide-out panel */}
      <div
        onKeyDown={handlePanelKeyDown}
        className={`
          fixed top-0 right-0 h-full w-full max-w-md z-50
          bg-bg border-l border-bg-border
          flex flex-col
          shadow-2xl shadow-black/50
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-label="AI Co-pilot chat"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border bg-bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/20">
              <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">AI Co-pilot</h2>
              <p className="text-[10px] text-muted">Trading assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={clearHistory}
              className="p-2 text-muted hover:text-white hover:bg-bg-border rounded-lg transition-colors"
              aria-label="Clear chat history"
              title="Clear history"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button
              onClick={closePanel}
              className="p-2 text-muted hover:text-white hover:bg-bg-border rounded-lg transition-colors"
              aria-label="Close chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin py-3 space-y-1">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 mb-4">
                <svg className="w-8 h-8 text-accent/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">AI Co-pilot</h3>
              <p className="text-muted text-sm mb-6">
                Ask me about your portfolio, market conditions, or trading strategies.
              </p>

              {/* Quick action chips */}
              <div className="flex flex-wrap justify-center gap-2">
                {QUICK_ACTIONS.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickAction(action)}
                    className="px-3 py-1.5 text-xs font-medium rounded-full border border-accent/30 text-accent bg-accent/10 hover:bg-accent/20 hover:border-accent/50 transition-all duration-150"
                    disabled={isLoading}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              <CoPilotMessage message={msg} onRetry={msg.error ? handleRetry : undefined} />
              {msg.actions && msg.actions.length > 0 && !msg.error && (
                <CoPilotActions
                  actions={msg.actions}
                  content={msg.content}
                  onRefresh={handleRetry}
                />
              )}
            </div>
          ))}

          {isLoading && <CoPilotTypingIndicator />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <CoPilotInput />
      </div>
    </>
  );
}
