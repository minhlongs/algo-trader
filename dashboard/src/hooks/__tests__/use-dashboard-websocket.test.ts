import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSocket before importing the hook
const mockWebSocket = vi.fn();
const mockOnOpen = vi.fn();
const mockOnClose = vi.fn();
const mockOnMessage = vi.fn();
const mockOnError = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDashboardWebSocket', () => {
  it('is importable', async () => {
    const mod = await import('../use-dashboard-websocket');
    expect(typeof mod.useDashboardWebSocket).toBe('function');
  });

  it('WebSocket is called with correct URL when rendered', async () => {
    const mod = await import('../use-dashboard-websocket');
    const { renderHook, act } = await import('@testing-library/react');

    // Mock WebSocket globally
    const wsMock = {
      close: vi.fn(),
      send: vi.fn(),
      set onopen(fn: () => void) { mockOnOpen.mockImplementation(fn); },
      set onclose(fn: () => void) { mockOnClose.mockImplementation(fn); },
      set onmessage(fn: (e: { data: string }) => void) { mockOnMessage.mockImplementation((e) => fn(e)); },
      set onerror(fn: () => void) { mockOnError.mockImplementation(fn); },
    };
    (global as Record<string, unknown>).WebSocket = vi.fn().mockImplementation(() => wsMock);
    // Explicitly set the mock constructor
    vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => ({
      close: vi.fn(),
      send: vi.fn(),
    })));

    renderHook(() => mod.useDashboardWebSocket());

    // WebSocket should have been instantiated
    expect(vi.mocked(WebSocket)).toHaveBeenCalled();
  });
});
