/**
 * Equity Snapshot Manager Test Fixtures — Tranche 41
 * Shared mocks and helpers for equity-snapshot-manager test suites.
 */
import { vi } from 'vitest';

export const SNAPSHOT_INPUT = {
  totalEquity: 10_000,
  cashBalance: 5_000,
  unrealizedPnl: 250,
  realizedPnlDaily: 120,
  openPositions: 3,
  drawdownPct: 0.02,
  metadata: { strategy: 'arb-v2' },
};

export interface MockPostgres {
  mockQuery: ReturnType<typeof vi.fn>;
  mockRelease: ReturnType<typeof vi.fn>;
  mockConnect: ReturnType<typeof vi.fn>;
  mockGetDbClient: ReturnType<typeof vi.fn>;
}

export function setupPostgresMocks(): MockPostgres {
  const mockQuery = vi.fn();
  const mockRelease = vi.fn();
  const mockConnect = vi.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });
  const mockGetDbClient = vi.fn().mockReturnValue({ connect: mockConnect });
  return { mockQuery, mockRelease, mockConnect, mockGetDbClient };
}

export interface InsertRowShape {
  id: number;
  timestamp: number;
  total_equity: string;
  cash_balance: string;
  unrealized_pnl: string;
  realized_pnl_daily: string;
  open_positions: number;
  drawdown_pct: string;
  metadata: Record<string, unknown> | null;
}

export function mockInsertResult(id = 42): void {
  void id; // reserved for custom row overrides; default row used below
}

export function mockSelectResult(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows;
}

export function mockDeleteResult(rowCount: number): number {
  return rowCount;
}
