/**
 * Co-pilot store — Zustand state for the AI Co-pilot chat widget.
 * Manages messages, loading state, panel open/close, and API communication.
 * Persists message history to localStorage.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ActionButton {
  label: string;
  action: string; // e.g. 'navigate:/app/strategies', 'refresh', 'copy', 'acknowledge'
  data?: string;  // optional extra data (e.g. URL to navigate to)
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: ActionButton[];
  timestamp: number;
  error?: boolean;
}

const MAX_STORED_MESSAGES = 100;

export interface CoPilotState {
  messages: Message[];
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  sendQuery: (query: string) => Promise<void>;
  toggleOpen: () => void;
  closePanel: () => void;
  clearHistory: () => void;
  retryLast: () => Promise<void>;
}

export const useCoPilotStore = create<CoPilotState>()(
  persist(
    (set, get) => ({
      messages: [],
      isOpen: false,
      isLoading: false,
      error: null,

      toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),

      closePanel: () => set({ isOpen: false }),

      clearHistory: () => set({ messages: [], error: null }),

      sendQuery: async (query: string) => {
        const trimmed = query.trim();
        if (!trimmed || get().isLoading) return;

        const userMsg: Message = {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'user',
          content: trimmed,
          timestamp: Date.now(),
        };

        set((s) => ({
          messages: [...s.messages, userMsg],
          isLoading: true,
          error: null,
        }));

        try {
          const res = await fetch('/api/v1/co-pilot/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: trimmed }),
          });

          if (!res.ok) {
            throw new Error(`Server responded with ${res.status}`);
          }

          const data = await res.json();

          const assistantMsg: Message = {
            id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: 'assistant',
            content: data.answer || 'No response content.',
            actions: data.actions ?? undefined,
            timestamp: Date.now(),
          };

          set((s) => {
            const updated = [...s.messages, assistantMsg];
            // Trim to max stored messages
            if (updated.length > MAX_STORED_MESSAGES) {
              return { messages: updated.slice(-MAX_STORED_MESSAGES), isLoading: false };
            }
            return { messages: updated, isLoading: false };
          });
        } catch (err) {
          const errorMsg: Message = {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: err instanceof Error ? err.message : 'Failed to get response. Please try again.',
            timestamp: Date.now(),
            error: true,
            actions: [{ label: 'Retry', action: 'retry' }],
          };

          set((s) => ({
            messages: [...s.messages, errorMsg],
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to get response.',
          }));
        }
      },

      retryLast: async () => {
        const { messages } = get();
        // Find the last user message
        const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
        if (lastUserMsg) {
          // Remove the last bot response if it was an error
          const lastMsg = messages[messages.length - 1];
          if (lastMsg?.error) {
            set({ messages: messages.slice(0, -1) });
          }
          await get().sendQuery(lastUserMsg.content);
        }
      },
    }),
    {
      name: 'cashclaw-copilot',
      partialize: (state) => ({
        messages: state.messages.slice(-50), // Only persist last 50 messages
      }),
    }
  )
);
