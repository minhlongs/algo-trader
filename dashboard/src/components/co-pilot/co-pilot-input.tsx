/**
 * Co-pilot input bar — text input with send button.
 *
 * Enter to send, Shift+Enter for newline.
 * Disabled while loading. Character limit: 500.
 */
import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { useCoPilotStore } from '../../stores/co-pilot-store';

const MAX_CHARS = 500;

export function CoPilotInput() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { sendQuery, isLoading } = useCoPilotStore();

  const canSend = text.trim().length > 0 && !isLoading;

  const handleSubmit = useCallback(() => {
    if (!canSend) return;
    sendQuery(text);
    setText('');
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [canSend, sendQuery, text]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleInput = useCallback((value: string) => {
    if (value.length <= MAX_CHARS) {
      setText(value);
    }
    // Auto-resize textarea
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, []);

  return (
    <div className="border-t border-bg-border px-4 py-3">
      <div className="flex items-end gap-2 bg-bg border border-bg-border rounded-xl px-3 py-2 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20 transition-all">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a question..."
          disabled={isLoading}
          rows={1}
          maxLength={MAX_CHARS}
          className="flex-1 bg-transparent text-sm text-white placeholder-muted outline-none resize-none min-h-[24px] max-h-[120px] disabled:opacity-50"
          aria-label="Chat input"
        />

        <button
          onClick={handleSubmit}
          disabled={!canSend}
          className={`
            flex-shrink-0 flex items-center justify-center
            w-9 h-9 rounded-lg
            transition-all duration-150
            ${canSend
              ? 'bg-accent text-bg hover:bg-accent/90 active:scale-95'
              : 'bg-bg-border text-muted/40 cursor-not-allowed'
            }
          `}
          aria-label="Send message"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Character count */}
      <div className="flex justify-between items-center mt-1 px-1">
        <p className="text-[10px] text-muted/40">
          Enter to send &middot; Shift+Enter for newline
        </p>
        <p className={`text-[10px] ${text.length >= MAX_CHARS ? 'text-loss' : 'text-muted/40'}`}>
          {text.length}/{MAX_CHARS}
        </p>
      </div>
    </div>
  );
}
