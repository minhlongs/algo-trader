/**
 * Unit tests for NatsStrategyBridge & NatsEventLoop
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NatsStrategyBridge,
  type StrategyCallbacks,
  type MarketUpdateData,
  type SignalDetectedData,
  type DependencyUpdateData,
} from '../../../src/desk/wiring/nats-strategy-bridge';
import { startNatsEventLoop } from '../../../src/desk/wiring/nats-event-loop';
import * as messagingModule from '../../../src/shared/messaging/index';

describe('NATS Strategy Bridge & Event Loop', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('NatsStrategyBridge', () => {
    let mockBus: any;
    let bridge: NatsStrategyBridge;
    let marketCb: (env: any) => Promise<void>;
    let signalCb: (env: any) => Promise<void>;
    let depCb: (env: any) => Promise<void>;

    beforeEach(() => {
      mockBus = {
        subscribe: vi.fn().mockImplementation((topic, handler) => {
          if (topic === messagingModule.Topics.MARKET_UPDATE) marketCb = handler;
          if (topic === 'signal.*.detected') signalCb = handler;
          if (topic === messagingModule.Topics.INTELLIGENCE_DEPENDENCIES) depCb = handler;
          return Promise.resolve(vi.fn());
        }),
        publish: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true),
        close: vi.fn().mockResolvedValue(undefined),
      };
      bridge = new NatsStrategyBridge(mockBus);
    });

    it('subscribes to topics and avoids duplicate subscriptions when called again', async () => {
      await bridge.subscribeAll();
      expect(mockBus.subscribe).toHaveBeenCalledTimes(3);

      // Second call should be a no-op (idempotent)
      await bridge.subscribeAll();
      expect(mockBus.subscribe).toHaveBeenCalledTimes(3);
    });

    it('dispatches market updates to registered strategies and handles handler errors', async () => {
      await bridge.subscribeAll();

      const strat1OnMarket = vi.fn().mockResolvedValue(undefined);
      const strat2OnMarket = vi.fn().mockRejectedValue(new Error('Strategy 2 crash'));

      bridge.registerStrategy('strat-1', { onMarketUpdate: strat1OnMarket });
      bridge.registerStrategy('strat-2', { onMarketUpdate: strat2OnMarket });

      const env = {
        topic: messagingModule.Topics.MARKET_UPDATE,
        data: { marketId: 'poly-1', price: 0.52 },
      };

      await marketCb(env);
      expect(strat1OnMarket).toHaveBeenCalledWith(env.data, env.topic);
      expect(strat2OnMarket).toHaveBeenCalledWith(env.data, env.topic);
    });

    it('dispatches signal detected events to registered strategies', async () => {
      await bridge.subscribeAll();

      const stratOnSignal = vi.fn().mockResolvedValue(undefined);
      bridge.registerStrategy('signal-strat', { onSignalDetected: stratOnSignal });

      const env = {
        topic: 'signal.arbitrage.detected',
        data: { signalType: 'cross-market', marketId: 'm1', confidence: 0.9 },
      };

      await signalCb(env);
      expect(stratOnSignal).toHaveBeenCalledWith(env.data, env.topic);
    });

    it('dispatches dependency updates to registered strategies', async () => {
      await bridge.subscribeAll();

      const stratOnDep = vi.fn().mockResolvedValue(undefined);
      bridge.registerStrategy('dep-strat', { onDependencyUpdate: stratOnDep });

      const env = {
        topic: messagingModule.Topics.INTELLIGENCE_DEPENDENCIES,
        data: { nodes: ['m1', 'm2'], edges: [{ from: 'm1', to: 'm2', weight: 0.8 }] },
      };

      await depCb(env);
      expect(stratOnDep).toHaveBeenCalledWith(env.data);
    });

    it('publishes signals to the message bus and catches errors', async () => {
      await bridge.publishSignal('signal.order.execute', { orderId: 'ord-1' });
      expect(mockBus.publish).toHaveBeenCalledWith(
        'signal.order.execute',
        { orderId: 'ord-1' },
        'strategy-bridge',
      );

      mockBus.publish.mockRejectedValueOnce(new Error('Publish timeout'));
      await expect(
        bridge.publishSignal('signal.order.execute', { orderId: 'ord-2' }),
      ).resolves.not.toThrow();
    });

    it('unregisters strategies and cleans up subscriptions on unsubscribeAll', async () => {
      const unsubFn = vi.fn();
      mockBus.subscribe.mockResolvedValue(unsubFn);
      await bridge.subscribeAll();

      bridge.registerStrategy('removable-strat', { onMarketUpdate: vi.fn() });
      bridge.unregisterStrategy('removable-strat');

      await bridge.unsubscribeAll();
      expect(unsubFn).toHaveBeenCalled();
    });
  });

  describe('startNatsEventLoop', () => {
    it('returns a no-op loop when NATS_URL and REDIS_URL are unset', async () => {
      delete process.env.NATS_URL;
      delete process.env.REDIS_URL;

      const loop = await startNatsEventLoop();
      expect(loop.isConnected()).toBe(false);
      expect(loop.bridge).toBeDefined();
      await expect(loop.stop()).resolves.not.toThrow();
    });

    it('returns a no-op loop when createMessageBus throws', async () => {
      process.env.NATS_URL = 'nats://localhost:4222';
      vi.spyOn(messagingModule, 'createMessageBus').mockRejectedValueOnce(
        new Error('NATS offline'),
      );

      const loop = await startNatsEventLoop();
      expect(loop.isConnected()).toBe(false);
    });

    it('connects and initializes NatsStrategyBridge when transport is available', async () => {
      process.env.NATS_URL = 'nats://localhost:4222';
      const mockBusInstance = {
        subscribe: vi.fn().mockResolvedValue(vi.fn()),
        publish: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.spyOn(messagingModule, 'createMessageBus').mockResolvedValue(mockBusInstance as any);
      const closeSpy = vi.spyOn(messagingModule, 'closeMessageBus').mockResolvedValue(undefined);

      const loop = await startNatsEventLoop();
      expect(loop.isConnected()).toBe(true);
      expect(mockBusInstance.subscribe).toHaveBeenCalledTimes(3);

      await loop.stop();
      expect(closeSpy).toHaveBeenCalled();
    });
  });
});
