import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  processCandidate,
  resetPortfolio,
  getPortfolio,
} from '../../../../src/desk/wiring/paper-trading-orchestrator';
import { setTradesFile } from '../../../../src/desk/wiring/paper-trading-persistence';
import { isKillSwitchActive, isQwenEnabled } from '../../../../src/desk/wiring/qwen-drawdown-monitor';
import { resetCapitalReservations } from '../../../../src/desk/wiring/paper-capital-reservation';
import type { SignalCandidate } from '../../../../src/desk/intelligence/signal-validator';
import * as postgresClient from '../../../../src/db/postgres-client';
import * as path from 'path';

describe('Paper Trading Real Execution Path Kill Switch Contract', () => {
  const tmpTradesFile = path.resolve('.tmp-test-trades.json');

  beforeEach(() => {
    delete process.env.QWEN_KILL;
    setTradesFile(tmpTradesFile);
    resetPortfolio();
    resetCapitalReservations();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.QWEN_KILL;
  });

  it('Baseline: processCandidate creates paper position and persists trade when kill is not set', async () => {
    const querySpy = vi.spyOn(postgresClient, 'query').mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const candidate: SignalCandidate = {
      signalType: 'qwen-momentum-alpha',
      markets: [{ id: 'm1', title: 'Market 1', yesPrice: 0.96, noPrice: 0.04 }],
      expectedEdge: 0.02,
      reasoning: 'Endgame near-certain test trade',
    };

    await processCandidate(candidate, 5);

    const p = getPortfolio();
    expect(p.positions.length).toBe(1);
    expect(p.positions[0].source).toBe('qwen');
    expect(p.positions[0].marketId).toBe('m1');
    expect(querySpy).toHaveBeenCalled();
  });

  it('Kill Active: processCandidate immediately halts Qwen signal with 0 mutations when QWEN_KILL=1', async () => {
    process.env.QWEN_KILL = '1';
    const querySpy = vi.spyOn(postgresClient, 'query').mockResolvedValue({ rows: [], rowCount: 1 } as any);

    const candidate: SignalCandidate = {
      signalType: 'qwen-momentum-alpha',
      markets: [{ id: 'm2', title: 'Market 2', yesPrice: 0.96, noPrice: 0.04 }],
      expectedEdge: 0.02,
      reasoning: 'Endgame near-certain test trade',
    };

    await processCandidate(candidate, 5);

    const p = getPortfolio();
    expect(p.positions.length).toBe(0);
    expect(querySpy).not.toHaveBeenCalled();
  });
});
