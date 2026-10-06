/**
 * Unit tests for Paper Trading Orchestrator, Market Scanner, Runner, and Persistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  processCandidate,
  deriveSource,
  recordMarlPaperFill,
  startPaperTrading,
  type PaperTrade,
} from '../../../src/desk/wiring/paper-trading-orchestrator';
import {
  getPortfolio,
  setPortfolio,
  setTradesFile,
  resetPortfolio,
  saveTrades,
  loadTrades,
  settleStalePositions,
  savePaperTradeV3,
  createDefaultPortfolio,
} from '../../../src/desk/wiring/paper-trading-persistence';
import * as paperTradingPersistence from '../../../src/desk/wiring/paper-trading-persistence';
import * as paperTradingScanner from '../../../src/desk/wiring/paper-trading-market-scanner';
import { scanAndTrade } from '../../../src/desk/wiring/paper-trading-market-scanner';
import { publishMetrics, runPaperTradingLoop } from '../../../src/desk/wiring/paper-trading-orchestrator-runner';
import * as postgresClient from '../../../src/db/postgres-client';
import * as persistentStore from '../../../src/shared/persistence/persistent-store';
import * as signalConsensusSwarm from '../../../src/desk/intelligence/signal-consensus-swarm';
import * as signalValidator from '../../../src/desk/intelligence/signal-validator';
import * as predictionAccuracyTracker from '../../../src/desk/intelligence/prediction-accuracy-tracker';
import * as reflectionEngine from '../../../src/desk/intelligence/dual-level-reflection-engine';
import * as qwenMonitor from '../../../src/desk/wiring/qwen-drawdown-monitor';
import * as messageBusModule from '../../../src/shared/messaging/create-message-bus';
import * as vibeController from '../../../src/desk/wiring/vibe-controller';
import * as natsEventLoopModule from '../../../src/desk/wiring/nats-event-loop';

describe('Paper Trading Orchestration & Submodules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPortfolio();
  });

  describe('paper-trading-persistence', () => {
    it('creates default portfolio and resets correctly', () => {
      const p = createDefaultPortfolio(2000);
      expect(p.capital).toBe(2000);
      expect(p.positions).toEqual([]);
      expect(p.closedTrades).toEqual([]);
      expect(p.totalPnl).toBe(0);

      setPortfolio(p);
      expect(getPortfolio().capital).toBe(2000);

      resetPortfolio();
      expect(getPortfolio().capital).toBe(1000);
    });

    it('saves and loads trades with file store handlers', () => {
      const writeSpy = vi.spyOn(persistentStore, 'writeJson').mockImplementation(() => {});
      const readSpy = vi.spyOn(persistentStore, 'readJson').mockReturnValue({
        capital: 1500,
        positions: [],
        closedTrades: [],
        totalPnl: 50,
        winCount: 2,
        lossCount: 0,
      });

      setTradesFile('/tmp/test-trades.json');
      saveTrades();
      expect(writeSpy).toHaveBeenCalledWith('/tmp/test-trades.json', expect.any(Object));

      loadTrades();
      expect(getPortfolio().capital).toBe(1500);
      expect(getPortfolio().totalPnl).toBe(50);
    });

    it('handles load error gracefully by keeping existing portfolio', () => {
      vi.spyOn(persistentStore, 'readJson').mockImplementation(() => {
        throw new Error('File not found');
      });

      resetPortfolio();
      loadTrades();
      expect(getPortfolio().capital).toBe(1000);
    });

    it('settles stale positions, adjusts capital/pnl, and triggers reflection', async () => {
      const reflectSpy = vi.spyOn(reflectionEngine, 'reflectOnTrade').mockResolvedValue({} as any);

      const staleTime = Date.now() - 10 * 60_000;
      const p = getPortfolio();
      p.positions = [
        {
          id: 'stale-1',
          marketId: 'm-stale',
          side: 'YES',
          size: 50,
          entryPrice: 0.95, // isEndgameTrade = true
          strategy: 'endgame-scalp',
          source: 'legacy',
          signalConfidence: 0.9,
          swarmApproved: true,
          aiValidated: true,
          timestamp: staleTime,
        },
        {
          id: 'fresh-1',
          marketId: 'm-fresh',
          side: 'NO',
          size: 50,
          entryPrice: 0.50,
          strategy: 'simple-arb',
          source: 'legacy',
          signalConfidence: 0.8,
          swarmApproved: true,
          aiValidated: true,
          timestamp: Date.now(),
        },
      ];

      await settleStalePositions();
      expect(p.positions).toHaveLength(1);
      expect(p.positions[0].id).toBe('fresh-1');
      expect(p.closedTrades).toHaveLength(1);
      expect(p.closedTrades[0].id).toBe('stale-1');
      expect(reflectSpy).toHaveBeenCalled();
    });

    it('persists paper trade to postgres table paper_trades_v3', async () => {
      const querySpy = vi.spyOn(postgresClient, 'query').mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const sampleTrade: PaperTrade = {
        id: 'trade-db-1',
        marketId: 'm1',
        side: 'YES',
        size: 50,
        entryPrice: 0.5,
        strategy: 'poly-arb',
        source: 'legacy',
        signalConfidence: 0.85,
        swarmApproved: true,
        aiValidated: true,
        timestamp: Date.now(),
      };

      await savePaperTradeV3(sampleTrade);
      expect(querySpy).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO paper_trades_v3'),
        expect.arrayContaining(['trade-db-1', 'm1', 'YES', 50, 0.5, 'poly-arb', 'legacy']),
      );

      // Error resilience
      querySpy.mockRejectedValueOnce(new Error('DB unreachable'));
      await expect(savePaperTradeV3(sampleTrade)).resolves.not.toThrow();
    });
  });

  describe('deriveSource', () => {
    it('correctly categorizes source by prefix', () => {
      expect(deriveSource('qwen-momentum')).toBe('qwen');
      expect(deriveSource('deepseek-reflection')).toBe('deepseek');
      expect(deriveSource('swarm-debate')).toBe('swarm');
      expect(deriveSource('endgame-scalp')).toBe('legacy');
    });
  });

  describe('recordMarlPaperFill', () => {
    it('records maker fill, deducts notional capital, and logs position', () => {
      const trade = recordMarlPaperFill('m-marl-1', 'buy', 100, 0.55);
      expect(trade.side).toBe('YES');
      expect(trade.size).toBeCloseTo(55); // 100 * 0.55
      expect(getPortfolio().positions).toHaveLength(1);
      expect(getPortfolio().capital).toBeCloseTo(1000 - 55);

      const sellTrade = recordMarlPaperFill('m-marl-2', 'sell', 200, 0.40);
      expect(sellTrade.side).toBe('NO');
      expect(sellTrade.size).toBe(80);
    });
  });

  describe('processCandidate & AI validation flow', () => {
    it('blocks Qwen candidate when isQwenEnabled is false', async () => {
      vi.spyOn(qwenMonitor, 'isQwenEnabled').mockReturnValue(false);

      await processCandidate(
        {
          signalType: 'qwen-alpha',
          markets: [{ id: 'm1', title: 'Qwen Test', yesPrice: 0.4, noPrice: 0.6 }],
          expectedEdge: 0.05,
          reasoning: 'Qwen model signal',
        },
        5,
      );

      expect(getPortfolio().positions).toHaveLength(0);
    });

    it('processes endgame signals skipping swarm and AI validation', async () => {
      const recordSpy = vi.spyOn(predictionAccuracyTracker, 'recordPrediction').mockImplementation(() => {});

      await processCandidate(
        {
          signalType: 'endgame-scalp',
          markets: [{ id: 'm-endgame', title: 'Near Resolution', yesPrice: 0.96, noPrice: 0.04 }],
          expectedEdge: 0.02,
          reasoning: 'Endgame: near-certain resolution',
        },
        5,
      );

      expect(getPortfolio().positions).toHaveLength(1);
      const pos = getPortfolio().positions[0];
      expect(pos.marketId).toBe('m-endgame');
      expect(pos.side).toBe('YES');
      expect(recordSpy).toHaveBeenCalled();
    });

    it('validates non-endgame signals through Swarm and AI validator', async () => {
      vi.spyOn(signalConsensusSwarm, 'runSwarmConsensus').mockResolvedValue({
        approved: true,
        confidence: 0.85,
        votes: [],
        dissent: null,
      } as any);

      vi.spyOn(signalValidator, 'validateSignal').mockResolvedValue({
        valid: true,
        confidence: 0.90,
        reasoning: 'AI Approved',
        risks: [],
      });

      await processCandidate(
        {
          signalType: 'cross-market-arb',
          markets: [{ id: 'm-cross', title: 'Cross Arb', yesPrice: 0.45, noPrice: 0.55 }],
          expectedEdge: 0.08,
          reasoning: 'Arbitrage detected across correlated contracts',
        },
        5,
      );

      expect(getPortfolio().positions).toHaveLength(1);
      expect(getPortfolio().positions[0].marketId).toBe('m-cross');
    });

    it('rejects candidate when swarm consensus rejects', async () => {
      vi.spyOn(signalConsensusSwarm, 'runSwarmConsensus').mockResolvedValue({
        approved: false,
        confidence: 0.4,
        votes: [],
        dissent: 'High risk',
      } as any);

      await processCandidate(
        {
          signalType: 'cross-market-arb',
          markets: [{ id: 'm-cross-rej', title: 'Cross Arb', yesPrice: 0.45, noPrice: 0.55 }],
          expectedEdge: 0.08,
          reasoning: 'Candidate rejected by swarm',
        },
        5,
      );

      expect(getPortfolio().positions).toHaveLength(0);
    });

    it('manages atomic capital reservation across concurrent signals', async () => {
      // Setup portfolio with $100
      setPortfolio(createDefaultPortfolio(100));

      let resolveSwarm1: (val: any) => void;
      const swarmPromise1 = new Promise((resolve) => {
        resolveSwarm1 = resolve;
      });

      const swarmSpy = vi.spyOn(signalConsensusSwarm, 'runSwarmConsensus');
      swarmSpy.mockImplementationOnce(() => swarmPromise1 as any);
      swarmSpy.mockResolvedValue({ approved: true, confidence: 0.9, votes: [] } as any);

      vi.spyOn(signalValidator, 'validateSignal').mockResolvedValue({
        valid: true,
        confidence: 0.85,
        reasoning: 'Valid',
      } as any);

      // Launch candidate 1 (hangs in swarm consensus)
      const p1 = processCandidate(
        {
          signalType: 'cross-market-arb',
          markets: [{ id: 'm-concurrent-1', title: 'Market 1', yesPrice: 0.45, noPrice: 0.55 }],
          expectedEdge: 0.08,
          reasoning: 'Signal 1',
        },
        1, // maxPositions: 1
      );

      // Launch candidate 2 immediately while candidate 1 is still running
      // Candidate 2 should be rejected because reservation count reaches maxPositions (1)
      await processCandidate(
        {
          signalType: 'cross-market-arb',
          markets: [{ id: 'm-concurrent-2', title: 'Market 2', yesPrice: 0.45, noPrice: 0.55 }],
          expectedEdge: 0.08,
          reasoning: 'Signal 2',
        },
        1,
      );

      // Resolve candidate 1
      resolveSwarm1!({ approved: true, confidence: 0.9, votes: [] });
      await p1;

      // Only candidate 1 was entered, candidate 2 was blocked by reservation slot
      expect(getPortfolio().positions).toHaveLength(1);
      expect(getPortfolio().positions[0].marketId).toBe('m-concurrent-1');
    });
  });

  describe('paper-trading-market-scanner', () => {
    it('scans Polymarket Gamma API and detects cross-market, endgame, and spread opportunities', async () => {
      const mockMarketsResponse = [
        {
          conditionId: 'm1',
          question: 'Candidate A Primary',
          groupItemTitle: 'Election 2026',
          outcomePrices: JSON.stringify(['0.40', '0.60']),
          volume: 50000,
        },
        {
          conditionId: 'm2',
          question: 'Candidate A General',
          groupItemTitle: 'Election 2026',
          outcomePrices: JSON.stringify(['0.50', '0.50']), // General > Primary by 0.10 > 0.03 -> Strategy 1 trigger
          volume: 50000,
        },
        {
          conditionId: 'm3',
          question: 'Near resolution event',
          groupItemTitle: 'Event 3',
          outcomePrices: JSON.stringify(['0.97', '0.03']), // Endgame yes > 0.95 -> Strategy 2 trigger
          volume: 50000,
        },
        {
          conditionId: 'm4',
          question: 'Spread arb opportunity',
          groupItemTitle: 'Event 4',
          outcomePrices: JSON.stringify(['0.45', '0.45']), // Spread = 1 - 0.90 = 0.10 > 0.025 -> Strategy 3 trigger
          volume: 50000,
        },
      ];

      // Mock global fetch
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockMarketsResponse,
      } as any);

      const candidateSpy = vi.fn().mockResolvedValue(undefined);
      await scanAndTrade(candidateSpy, 5);

      expect(fetchSpy).toHaveBeenCalled();
      expect(candidateSpy).toHaveBeenCalled();
      expect(candidateSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('handles fetch network errors gracefully', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));
      const candidateSpy = vi.fn();
      await expect(scanAndTrade(candidateSpy, 5)).resolves.not.toThrow();
      expect(candidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('paper-trading-orchestrator-runner', () => {
    it('publishes metrics when message bus is connected', async () => {
      const mockPublish = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(messageBusModule, 'getMessageBus').mockReturnValue({
        isConnected: () => true,
        publish: mockPublish,
      } as any);

      await publishMetrics();
      expect(mockPublish).toHaveBeenCalledWith(
        'system.metrics',
        expect.objectContaining({ source: 'paper-trading-orchestrator' }),
        'paper-trading-orchestrator',
      );
    });

    it('skips metrics publish when message bus is disconnected', async () => {
      const mockPublish = vi.fn();
      vi.spyOn(messageBusModule, 'getMessageBus').mockReturnValue({
        isConnected: () => false,
        publish: mockPublish,
      } as any);

      await publishMetrics();
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('runs paper trading loop, sets up subscription and intervals', async () => {
      vi.useFakeTimers();
      const candidateProc = vi.fn().mockResolvedValue(undefined);

      let signalSubHandler: any;
      const mockBus = {
        subscribe: vi.fn().mockImplementation((topic, cb) => {
          if (topic === 'signal.validated') signalSubHandler = cb;
          return Promise.resolve(vi.fn());
        }),
        publish: vi.fn().mockResolvedValue(undefined),
        isConnected: () => true,
      };

      vi.spyOn(messageBusModule, 'createMessageBus').mockResolvedValue(mockBus as any);
      vi.spyOn(messageBusModule, 'getMessageBus').mockReturnValue(mockBus as any);
      vi.spyOn(predictionAccuracyTracker, 'startResolutionChecker').mockReturnValue({} as any);
      vi.spyOn(vibeController, 'initVibeController').mockResolvedValue({} as any);
      vi.spyOn(natsEventLoopModule, 'startNatsEventLoop').mockResolvedValue({
        isConnected: () => false,
        bridge: {} as any,
        stop: vi.fn().mockResolvedValue(undefined),
      } as any);
      const scanSpy = vi
        .spyOn(paperTradingScanner, 'scanAndTrade')
        .mockResolvedValue(undefined);
      const persistSpy = vi
        .spyOn(paperTradingPersistence, 'saveTrades')
        .mockImplementation(() => {});

      try {
        await runPaperTradingLoop(candidateProc, { intervalMs: 100, capitalUsdc: 5000 });
        expect(getPortfolio().capital).toBe(5000);
        expect(mockBus.subscribe).toHaveBeenCalledWith('signal.validated', expect.any(Function));

        // One interval tick drives the scanner, stale-position settle, and metrics publish
        await vi.advanceTimersByTimeAsync(100);
        expect(scanSpy).toHaveBeenCalledWith(candidateProc, 5);
        expect(mockBus.publish).toHaveBeenCalledWith(
          'system.metrics',
          expect.objectContaining({ source: 'paper-trading-orchestrator' }),
          'paper-trading-orchestrator',
        );

        // Trigger signal.validated message
        expect(signalSubHandler).toBeDefined();
        await signalSubHandler({
          data: {
            original: {
              signalType: 'simple-arb',
              markets: [{ id: 'm1', yesPrice: 0.5, noPrice: 0.5 }],
              expectedEdge: 0.05,
              reasoning: 'Validated signal',
            },
          },
        });
        expect(candidateProc).toHaveBeenCalledWith(
          expect.objectContaining({ signalType: 'simple-arb', expectedEdge: 0.05 }),
          5,
        );
      } finally {
        for (const sig of ['SIGTERM', 'SIGINT'] as const) {
          for (const listener of process.listeners(sig)) {
            process.removeListener(sig, listener as () => void);
          }
        }
        expect(persistSpy).not.toHaveBeenCalled();
        vi.useRealTimers();
      }
    });

    it('persists trades and stops the loop on SIGTERM shutdown', async () => {
      const candidateProc = vi.fn().mockResolvedValue(undefined);
      const stopSpy = vi.fn().mockResolvedValue(undefined);

      const mockBus = {
        subscribe: vi.fn().mockResolvedValue(vi.fn()),
        publish: vi.fn().mockResolvedValue(undefined),
        isConnected: () => true,
      };

      vi.spyOn(messageBusModule, 'createMessageBus').mockResolvedValue(mockBus as any);
      vi.spyOn(messageBusModule, 'getMessageBus').mockReturnValue(mockBus as any);
      vi.spyOn(predictionAccuracyTracker, 'startResolutionChecker').mockReturnValue({} as any);
      vi.spyOn(vibeController, 'initVibeController').mockResolvedValue({} as any);
      vi.spyOn(natsEventLoopModule, 'startNatsEventLoop').mockResolvedValue({
        isConnected: () => false,
        bridge: {} as any,
        stop: stopSpy,
      } as any);
      vi.spyOn(paperTradingScanner, 'scanAndTrade').mockResolvedValue(undefined);
      const persistSpy = vi
        .spyOn(paperTradingPersistence, 'saveTrades')
        .mockImplementation(() => {});

      try {
        await runPaperTradingLoop(candidateProc, { intervalMs: 60_000, capitalUsdc: 2000 });
        expect(getPortfolio().capital).toBe(2000);

        const shutdownHandlers = process.listeners('SIGTERM') as (() => Promise<void>)[];
        expect(shutdownHandlers.length).toBeGreaterThan(0);
        for (const handler of shutdownHandlers) await handler();

        expect(stopSpy).toHaveBeenCalled();
        expect(persistSpy).toHaveBeenCalled();
      } finally {
        for (const sig of ['SIGTERM', 'SIGINT'] as const) {
          for (const listener of process.listeners(sig)) {
            process.removeListener(sig, listener as () => void);
          }
        }
      }
    });
  });
});
