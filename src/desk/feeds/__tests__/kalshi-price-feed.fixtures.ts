import { vi } from 'vitest';

export function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(status: number, body = ''): Response {
  return new Response(body || `Error ${status}`, {
    status,
    statusText: 'Error',
  });
}

export const RAW_MARKET = {
  ticker: 'TEST-2026',
  title: 'Test Market',
  subtitle: 'A test',
  yes_bid: 45,
  yes_ask: 55,
  no_bid: 40,
  no_ask: 50,
  volume: 1000,
  open_interest: 500,
  status: 'open',
  category: 'politics',
};

vi.mock('../../../shared/messaging/index', () => ({
  getMessageBus: () => ({
    isConnected: () => true,
    publish: vi.fn(),
  }),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
