/**
 * Tests for the Co-pilot Chat Widget.
 *
 * Covers: rendering, open/close, messages, loading state,
 * error state, action buttons, input, and API submission.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CoPilotChat } from '../co-pilot/co-pilot-chat';
import { useCoPilotStore } from '../../stores/co-pilot-store';

// Mock the store for controlled tests
vi.mock('../../stores/co-pilot-store', () => ({
  useCoPilotStore: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Helper to render with router
function renderChat() {
  return render(
    <MemoryRouter>
      <CoPilotChat />
    </MemoryRouter>
  );
}

describe('CoPilotChat', () => {
  const mockSendQuery = vi.fn();
  const mockToggleOpen = vi.fn();
  const mockClosePanel = vi.fn();
  const mockClearHistory = vi.fn();
  const mockRetryLast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom does not implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();

    // Default store state
    (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: [],
      isOpen: false,
      isLoading: false,
      error: null,
      sendQuery: mockSendQuery,
      toggleOpen: mockToggleOpen,
      closePanel: mockClosePanel,
      clearHistory: mockClearHistory,
      retryLast: mockRetryLast,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('FAB', () => {
    it('renders floating action button', () => {
      renderChat();
      const fab = screen.getByRole('button', { name: /open ai co-pilot/i });
      expect(fab).toBeInTheDocument();
    });

    it('calls toggleOpen when FAB is clicked', () => {
      renderChat();
      const fab = screen.getByRole('button', { name: /open ai co-pilot/i });
      fireEvent.click(fab);
      expect(mockToggleOpen).toHaveBeenCalledTimes(1);
    });

    it('shows unread badge when messages exist and panel is closed', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [
          { id: '1', role: 'user', content: 'hi', timestamp: Date.now() },
          { id: '2', role: 'assistant', content: 'hello', timestamp: Date.now() },
        ],
        isOpen: false,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  describe('Chat panel', () => {
    it('does not show panel when isOpen is false', () => {
      renderChat();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows panel when isOpen is true', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        isOpen: true,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'AI Co-pilot chat');
    });

    it('calls closePanel when close button is clicked', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        isOpen: true,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      const closeBtn = screen.getByRole('button', { name: /close chat/i });
      fireEvent.click(closeBtn);
      expect(mockClosePanel).toHaveBeenCalledTimes(1);
    });

    it('shows quick action chips when no messages', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        isOpen: true,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      expect(screen.getByText("What's my risk exposure?")).toBeInTheDocument();
      expect(screen.getByText('Find arb opportunities')).toBeInTheDocument();
      expect(screen.getByText('Market regime?')).toBeInTheDocument();
      expect(screen.getByText('Generate report')).toBeInTheDocument();
    });

    it('sends query when quick action chip is clicked', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        isOpen: true,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      fireEvent.click(screen.getByText('Market regime?'));
      expect(mockSendQuery).toHaveBeenCalledWith('Market regime?');
    });

    it('calls clearHistory when clear button is clicked', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [
          { id: '1', role: 'user', content: 'hi', timestamp: Date.now() },
        ],
        isOpen: true,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      const clearBtn = screen.getByRole('button', { name: /clear chat history/i });
      fireEvent.click(clearBtn);
      expect(mockClearHistory).toHaveBeenCalledTimes(1);
    });
  });

  describe('Messages', () => {
    it('renders user and bot messages', () => {
      const now = Date.now();
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [
          { id: '1', role: 'user', content: 'What is my risk?', timestamp: now },
          { id: '2', role: 'assistant', content: 'Your risk is moderate.', timestamp: now + 1000 },
        ],
        isOpen: true,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      expect(screen.getByText('What is my risk?')).toBeInTheDocument();
      expect(screen.getByText('Your risk is moderate.')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows typing indicator when isLoading is true', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        isOpen: true,
        isLoading: true,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      expect(screen.getByText('AI is thinking...')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows error message with retry button', () => {
      const now = Date.now();
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [
          {
            id: '1',
            role: 'assistant',
            content: 'Failed to connect',
            error: true,
            timestamp: now,
            actions: [{ label: 'Retry', action: 'retry' }],
          },
        ],
        isOpen: true,
        isLoading: false,
        error: 'Failed to connect',
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to connect')).toBeInTheDocument();
      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeInTheDocument();
      fireEvent.click(retryBtn);
      expect(mockRetryLast).toHaveBeenCalledTimes(1);
    });
  });

  describe('Input', () => {
    it('renders input field and send button', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        isOpen: true,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      expect(screen.getByPlaceholderText('Type a question...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
    });

    it('disables send button when input is empty', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        isOpen: true,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      const sendBtn = screen.getByRole('button', { name: /send message/i });
      expect(sendBtn).toBeDisabled();
    });

    it('submits query on Enter', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        isOpen: true,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      const input = screen.getByPlaceholderText('Type a question...');
      fireEvent.change(input, { target: { value: 'What is my PnL?' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(mockSendQuery).toHaveBeenCalledWith('What is my PnL?');
    });

    it('does not submit empty text', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        isOpen: true,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      const input = screen.getByPlaceholderText('Type a question...');
      fireEvent.change(input, { target: { value: ' ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(mockSendQuery).not.toHaveBeenCalled();
    });

    it('disables input while loading', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        isOpen: true,
        isLoading: true,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      expect(screen.getByPlaceholderText('Type a question...')).toBeDisabled();
    });
  });

  describe('Keyboard shortcut', () => {
    it('closes chat panel on Escape key', () => {
      (useCoPilotStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        messages: [],
        isOpen: true,
        isLoading: false,
        error: null,
        sendQuery: mockSendQuery,
        toggleOpen: mockToggleOpen,
        closePanel: mockClosePanel,
        clearHistory: mockClearHistory,
        retryLast: mockRetryLast,
      });
      renderChat();
      const panel = screen.getByRole('dialog');
      fireEvent.keyDown(panel, { key: 'Escape' });
      expect(mockClosePanel).toHaveBeenCalledTimes(1);
    });
  });
});
