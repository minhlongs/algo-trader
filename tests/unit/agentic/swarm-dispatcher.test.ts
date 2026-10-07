/**
 * Swarm Dispatcher & Lifecycle Coordinator Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SwarmLifecycleCoordinator } from '../../../src/agentic/swarm-lifecycle';
import { SwarmDispatcher } from '../../../src/agentic/swarm-dispatcher';
import type { SwarmProposal, SwarmAgentHandler } from '../../../src/agentic/types/swarm-types';

describe('SwarmLifecycleCoordinator', () => {
  let coordinator: SwarmLifecycleCoordinator;

  beforeEach(() => {
    coordinator = new SwarmLifecycleCoordinator('test-session-1');
  });

  afterEach(() => {
    coordinator.dispose();
  });

  it('initializes in INITIALIZED state', () => {
    expect(coordinator.getState()).toBe('INITIALIZED');
    expect(coordinator.isTerminal()).toBe(false);
  });

  it('follows valid lifecycle progression', () => {
    const states: string[] = [];
    coordinator.onStateChange((next) => states.push(next));

    coordinator.startAnalysis(5000);
    expect(coordinator.getState()).toBe('ANALYZING');

    coordinator.reachConsensus();
    expect(coordinator.getState()).toBe('CONSENSUS');

    coordinator.markExecuted();
    expect(coordinator.getState()).toBe('EXECUTED');
    expect(coordinator.isTerminal()).toBe(true);

    expect(states).toEqual(['ANALYZING', 'CONSENSUS', 'EXECUTED']);
  });

  it('throws on invalid state transitions', () => {
    coordinator.startAnalysis(5000);
    coordinator.reachConsensus();
    coordinator.markExecuted();

    // From EXECUTED cannot transition to ANALYZING
    expect(() => coordinator.startAnalysis(5000)).toThrow('Invalid swarm transition');
  });

  it('transitions to TIMED_OUT on forced timeout', () => {
    coordinator.startAnalysis(5000);
    coordinator.forceTimeout('Timeout triggered');

    expect(coordinator.getState()).toBe('TIMED_OUT');
    expect(coordinator.isTerminal()).toBe(true);
  });

  it('triggers onTimeout callback when timer expires', async () => {
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      coordinator.startAnalysis(100, onTimeout);

      vi.advanceTimersByTime(150);

      expect(coordinator.getState()).toBe('TIMED_OUT');
      expect(onTimeout).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets back to INITIALIZED', () => {
    coordinator.startAnalysis(5000);
    coordinator.reset();
    expect(coordinator.getState()).toBe('INITIALIZED');
  });
});

describe('SwarmDispatcher', () => {
  it('dispatches to primary tier and reaches consensus', async () => {
    const dispatcher = new SwarmDispatcher({
      primaryTier: 'opus',
      minConsensusConfidence: 0.6,
    });

    const result = await dispatcher.dispatch({ symbol: 'BTC-USD', price: 65000 });

    expect(result.symbol).toBe('BTC-USD');
    expect(result.finalAction).toBe('BUY');
    expect(result.weightedConfidence).toBeGreaterThan(0.6);
    expect(result.proposals).toHaveLength(1);
    expect(result.decidingTier).toBe('opus');

    const telemetry = dispatcher.getTelemetry();
    expect(telemetry).not.toBeNull();
    expect(telemetry?.dispatchedTier).toBe('opus');
    expect(telemetry?.fallbackTiersUsed).toEqual([]);
    expect(telemetry?.state).toBe('CONSENSUS');
  });

  it('falls back to secondary tier when primary tier fails', async () => {
    const mockHandler: SwarmAgentHandler = vi.fn(async (tier, signal) => {
      if (tier === 'opus') {
        throw new Error('Opus unavailable');
      }
      return {
        proposalId: 'prop-sonnet-1',
        agentName: 'sonnet-analyst',
        tier,
        symbol: signal.symbol,
        action: 'SELL',
        confidence: 0.82,
        price: signal.price,
        rationale: 'Sonnet fallback signal',
        timestamp: Date.now(),
      };
    });

    const dispatcher = new SwarmDispatcher(
      { primaryTier: 'opus', fallbackChain: ['opus', 'sonnet', 'haiku'] },
      mockHandler,
    );

    const result = await dispatcher.dispatch({ symbol: 'ETH-USD', price: 3500 });

    expect(result.finalAction).toBe('SELL');
    expect(result.decidingTier).toBe('sonnet');
    expect(result.weightedConfidence).toBeCloseTo(0.82, 2);

    const telemetry = dispatcher.getTelemetry();
    expect(telemetry?.fallbackTiersUsed).toContain('sonnet');
    expect(mockHandler).toHaveBeenCalledTimes(2);
  });

  it('cascades down to haiku when opus and sonnet both fail', async () => {
    const mockHandler: SwarmAgentHandler = vi.fn(async (tier, signal) => {
      if (tier === 'opus' || tier === 'sonnet') {
        throw new Error(`${tier} failure`);
      }
      return {
        proposalId: 'prop-haiku-1',
        agentName: 'haiku-scanner',
        tier,
        symbol: signal.symbol,
        action: 'BUY',
        confidence: 0.70,
        price: signal.price,
        rationale: 'Haiku fast proposal',
        timestamp: Date.now(),
      };
    });

    const dispatcher = new SwarmDispatcher(
      { primaryTier: 'opus', fallbackChain: ['opus', 'sonnet', 'haiku'] },
      mockHandler,
    );

    const result = await dispatcher.dispatch({ symbol: 'SOL-USD', price: 150 });

    expect(result.finalAction).toBe('BUY');
    expect(result.decidingTier).toBe('haiku');

    const telemetry = dispatcher.getTelemetry();
    expect(telemetry?.fallbackTiersUsed).toEqual(['sonnet', 'haiku']);
    expect(mockHandler).toHaveBeenCalledTimes(3);
  });

  it('throws and records timeout when all fallback tiers fail', async () => {
    const failingHandler: SwarmAgentHandler = vi.fn(async (tier) => {
      throw new Error(`All down: ${tier}`);
    });

    const dispatcher = new SwarmDispatcher(
      { primaryTier: 'opus', fallbackChain: ['opus', 'sonnet', 'haiku'] },
      failingHandler,
    );

    await expect(dispatcher.dispatch({ symbol: 'DOGE-USD' })).rejects.toThrow(
      'Swarm dispatch failed: all tiers exhausted for DOGE-USD',
    );

    const telemetry = dispatcher.getTelemetry();
    expect(telemetry?.timedOut).toBe(true);
    expect(telemetry?.finalDecision).toBe('HOLD');
    expect(dispatcher.getLifecycle().getState()).toBe('TIMED_OUT');
  });

  it('falls back to HOLD when weighted confidence is below threshold', async () => {
    const lowConfidenceHandler: SwarmAgentHandler = async (tier, sig) => ({
      proposalId: 'prop-low-1',
      agentName: `agent-${tier}`,
      tier,
      symbol: sig.symbol,
      action: 'BUY',
      confidence: 0.45,
      rationale: 'Low conviction signal',
      timestamp: Date.now(),
    });

    const dispatcher = new SwarmDispatcher(
      { primaryTier: 'opus', minConsensusConfidence: 0.75 },
      lowConfidenceHandler,
    );

    const result = await dispatcher.dispatch({ symbol: 'BTC-USD' });
    expect(result.finalAction).toBe('HOLD');
    expect(result.weightedConfidence).toBeCloseTo(0.45, 2);
  });
});
