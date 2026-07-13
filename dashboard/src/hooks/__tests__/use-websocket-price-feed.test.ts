import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useWebSocketPriceFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is importable', async () => {
    const mod = await import('../use-websocket-price-feed');
    expect(typeof mod.useWebSocketPriceFeed).toBe('function');
  });

  it('module loads without errors', async () => {
    // This hook manages its own WebSocket connection via useEffect.
    // We verify the hook exports are correct.
    const mod = await import('../use-websocket-price-feed');
    expect(mod.useWebSocketPriceFeed).toBeDefined();
  });
});
