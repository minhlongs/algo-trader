/**
 * Engine Supervisor Unit Test Suite
 * Milestone M3: Concurrent Multi-Engine Background Supervisor & Worker Daemon
 */

import { describe, it, expect } from 'vitest';
import { EngineSupervisor, SupervisedEngine } from '../../../src/desk/daemon/engine-supervisor';
import {
  createMockArbIntent,
  createMockMarlIntent,
  createMockAmmIntent,
  createMockAlphaIntent,
} from './helpers/mock-desk-components';

describe('EngineSupervisor & SupervisedEngine Unit Suite', () => {
  it('initializes with all 4 trading engines', () => {
    const supervisor = new EngineSupervisor();
    expect(supervisor.engines.size).toBe(4);
    expect(supervisor.getEngine('arbitrage')).toBeDefined();
    expect(supervisor.getEngine('marl')).toBeDefined();
    expect(supervisor.getEngine('amm')).toBeDefined();
    expect(supervisor.getEngine('alpha-lab')).toBeDefined();
    expect(supervisor.isRunning()).toBe(false);
  });

  it('concurrently starts and stops all 4 engines', async () => {
    const supervisor = new EngineSupervisor();
    await supervisor.start();
    expect(supervisor.isRunning()).toBe(true);

    const runStatuses = supervisor.getEngineStatuses();
    for (const id of ['arbitrage', 'marl', 'amm', 'alpha-lab']) {
      expect(runStatuses[id]?.status).toBe('RUNNING');
    }

    await supervisor.stop();
    expect(supervisor.isRunning()).toBe(false);
    const stopStatuses = supervisor.getEngineStatuses();
    for (const id of ['arbitrage', 'marl', 'amm', 'alpha-lab']) {
      expect(stopStatuses[id]?.status).toBe('STOPPED');
    }
  });

  it('aggregates queued trade intents across all 4 engines in single pollCycle', async () => {
    const supervisor = new EngineSupervisor();
    await supervisor.start();

    supervisor.getEngine('arbitrage')?.setQueue?.([createMockArbIntent()]);
    supervisor.getEngine('marl')?.setQueue?.([createMockMarlIntent()]);
    supervisor.getEngine('amm')?.setQueue?.([createMockAmmIntent()]);
    supervisor.getEngine('alpha-lab')?.setQueue?.([createMockAlphaIntent()]);

    const intents = await supervisor.pollCycle();
    expect(intents).toHaveLength(4);
    const engineIds = intents.map((i) => i.engineId).sort();
    expect(engineIds).toEqual(['alpha-lab', 'amm', 'arbitrage', 'marl']);

    // Second cycle without new intents should be empty
    const secondCycle = await supervisor.pollCycle();
    expect(secondCycle).toHaveLength(0);
    await supervisor.stop();
  });

  it('isolates single-engine failure during pollCycle without crashing peer engines', async () => {
    const supervisor = new EngineSupervisor();
    await supervisor.start();

    supervisor.getEngine('marl')?.setFailOnPoll?.(true, 'Simulated neural network crash');
    supervisor.getEngine('arbitrage')?.setQueue?.([createMockArbIntent()]);
    supervisor.getEngine('amm')?.setQueue?.([createMockAmmIntent()]);

    const intents = await supervisor.pollCycle();
    expect(intents).toHaveLength(2);

    const statuses = supervisor.getEngineStatuses();
    expect(statuses['marl']?.status).toBe('ERROR');
    expect(statuses['marl']?.error).toBe('Simulated neural network crash');
    expect(statuses['arbitrage']?.status).toBe('RUNNING');
    expect(statuses['amm']?.status).toBe('RUNNING');
    await supervisor.stop();
  });

  it('normalizes raw signals via SignalNormalizer when enqueued to SupervisedEngine', async () => {
    const arbEngine = new SupervisedEngine('arbitrage');
    await arbEngine.start();

    // Raw spread opportunity
    arbEngine.enqueueRaw({
      id: 'opp-101',
      symbol: 'BTC/USDT',
      buyExchange: 'binance',
      sellExchange: 'bybit',
      buyPrice: 65000,
      sellPrice: 65100,
      spreadPercent: 0.0015,
      timestamp: Date.now(),
    });

    const intents = await arbEngine.poll();
    expect(intents.length).toBeGreaterThanOrEqual(1);
    expect(intents[0]?.engineId).toBe('arbitrage');
    expect(intents[0]?.symbol).toBe('BTC/USDT');
    expect(arbEngine.lastSignalTime).toBeDefined();
    await arbEngine.stop();
  });

  it('normalizes raw MARL, AMM, and Alpha-Lab signals correctly', async () => {
    const marlEngine = new SupervisedEngine('marl');
    const ammEngine = new SupervisedEngine('amm');
    const alphaEngine = new SupervisedEngine('alpha-lab');

    await marlEngine.start();
    await ammEngine.start();
    await alphaEngine.start();

    marlEngine.enqueueRaw({
      agentId: 'marl-agent-1',
      symbol: 'BTC/USDT',
      bidPrice: 64990,
      askPrice: 65010,
      bidSize: 0.5,
      askSize: 0.5,
      confidence: 0.9,
      venue: 'polymarket_clob',
    });

    ammEngine.enqueueRaw({
      outcomeId: 'ETH-YES',
      spreadBps: 20,
      bidPrice: 0.52,
      askPrice: 0.54,
      bidSize: 100,
      askSize: 100,
    });

    alphaEngine.enqueueRaw({
      strategyId: 'alpha-mom-1',
      symbol: 'ETH/USDT',
      direction: 'BUY',
      confidence: 0.88,
      expectancy: 0.02,
      regime: 'TRENDING',
    });

    const marlIntents = await marlEngine.poll();
    const ammIntents = await ammEngine.poll();
    const alphaIntents = await alphaEngine.poll();

    expect(marlIntents).toHaveLength(2); // bid and ask
    expect(ammIntents).toHaveLength(2); // bid and ask
    expect(alphaIntents).toHaveLength(1); // single direction
    expect(alphaIntents[0]?.engineId).toBe('alpha-lab');

    await marlEngine.stop();
    await ammEngine.stop();
    await alphaEngine.stop();
  });

  it('returns empty array when polling a stopped engine', async () => {
    const engine = new SupervisedEngine('arbitrage');
    engine.setQueue([createMockArbIntent()]);
    const intents = await engine.poll();
    expect(intents).toHaveLength(0);
  });
});
