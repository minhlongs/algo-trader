/**
 * Tests for JetStream Manager
 * Covers stream initialization, consumer creation, ordered consumers,
 * sequence monitoring, and ensureStream create/update/error paths
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AckPolicy, DeliverPolicy, RetentionPolicy, StorageType } from 'nats';
import type { JetStreamManager, ConsumerConfig } from 'nats';

const { mockGetNatsConnection, mockLogger } = vi.hoisted(() => ({
  mockGetNatsConnection: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../nats-connection-manager', () => ({ getNatsConnection: mockGetNatsConnection }));
vi.mock('../../utils/logger', () => ({ logger: mockLogger }));

import {
  initializeJetStreams,
  getJetStreamClient,
  createReplayConsumer,
  buildOrderedConsumerConfig,
  createOrderedConsumer,
  getConsumerSequence,
} from '../jetstream-manager';

function makeMockJsm(overrides: Partial<{
  streamsInfo: () => Promise<void>;
  streamsUpdate: () => Promise<void>;
  streamsAdd: () => Promise<void>;
  consumersAdd: () => Promise<{ name: string }>;
  consumersInfo: () => Promise<{ delivered: { stream_seq: number } }>;
}> = {}) {
  return {
    streams: {
      info: overrides.streamsInfo ?? vi.fn().mockRejectedValue(new Error('not found')),
      update: overrides.streamsUpdate ?? vi.fn().mockResolvedValue(undefined),
      add: overrides.streamsAdd ?? vi.fn().mockResolvedValue(undefined),
    },
    consumers: {
      add: overrides.consumersAdd ?? vi.fn().mockResolvedValue({ name: 'test-consumer' }),
      info: overrides.consumersInfo ?? vi.fn().mockResolvedValue({ delivered: { stream_seq: 42 } }),
    },
  };
}

describe('JetStreamManager', () => {
  let mockNc: ReturnType<typeof getNatsConnection> extends Promise<infer T> ? T : never;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNc = {
      jetstreamManager: vi.fn().mockResolvedValue(makeMockJsm()),
      jetstream: vi.fn().mockReturnValue({ publish: vi.fn() }),
    } as any;
    mockGetNatsConnection.mockReturnValue(mockNc);
  });

  // ── initializeJetStreams ──────────────────────────────────────────────────

  describe('initializeJetStreams', () => {
    it('creates all 3 streams (TRADES, SIGNALS, MARKET_DATA)', async () => {
      const jsm = makeMockJsm();
      mockNc.jetstreamManager.mockResolvedValue(jsm);

      await initializeJetStreams();

      expect(jsm.streams.add).toHaveBeenCalledTimes(3);
      const names = jsm.streams.add.mock.calls.map((c: any) => c[0].name);
      expect(names).toEqual(['TRADES', 'SIGNALS', 'MARKET_DATA']);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Initialized 3 streams'),
      );
    });

    it('updates existing streams instead of creating', async () => {
      const jsm = makeMockJsm({
        streamsInfo: vi.fn().mockResolvedValue({}),
      });
      mockNc.jetstreamManager.mockResolvedValue(jsm);

      await initializeJetStreams();

      expect(jsm.streams.update).toHaveBeenCalledTimes(3);
      expect(jsm.streams.add).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Updated stream'),
      );
    });

    it('handles create failure for a stream gracefully', async () => {
      const jsm = makeMockJsm({
        streamsAdd: vi.fn().mockRejectedValue(new Error('quota exceeded')),
      });
      mockNc.jetstreamManager.mockResolvedValue(jsm);

      await initializeJetStreams();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create stream'),
      );
    });

    it('uses memory storage for MARKET_DATA and file storage for TRADES', async () => {
      const jsm = makeMockJsm();
      mockNc.jetstreamManager.mockResolvedValue(jsm);

      await initializeJetStreams();

      const tradesDef = jsm.streams.add.mock.calls.find((c: any) => c[0].name === 'TRADES')?.[0];
      const marketDef = jsm.streams.add.mock.calls.find((c: any) => c[0].name === 'MARKET_DATA')?.[0];

      expect(tradesDef?.storage).toBe(StorageType.File);
      expect(marketDef?.storage).toBe(StorageType.Memory);
    });

    it('sets max_bytes from config when provided', async () => {
      const jsm = makeMockJsm();
      mockNc.jetstreamManager.mockResolvedValue(jsm);

      await initializeJetStreams();

      const marketDef = jsm.streams.add.mock.calls.find((c: any) => c[0].name === 'MARKET_DATA')?.[0];
      expect(marketDef?.max_bytes).toBe(1024 * 1024 * 512);
    });

    it('sets max_bytes to -1 when not provided', async () => {
      const jsm = makeMockJsm();
      mockNc.jetstreamManager.mockResolvedValue(jsm);

      await initializeJetStreams();

      const tradesDef = jsm.streams.add.mock.calls.find((c: any) => c[0].name === 'TRADES')?.[0];
      expect(tradesDef?.max_bytes).toBe(-1);
    });
  });

  // ── getJetStreamClient ────────────────────────────────────────────────────

  describe('getJetStreamClient', () => {
    it('returns the JetStream client from the connection', () => {
      const client = getJetStreamClient();
      expect(mockNc.jetstream).toHaveBeenCalled();
      expect(client).toBeDefined();
    });
  });

  // ── createReplayConsumer ──────────────────────────────────────────────────

  describe('createReplayConsumer', () => {
    it('creates a durable consumer with StartTime policy when startTime given', async () => {
      const jsm = makeMockJsm();
      mockNc.jetstreamManager.mockResolvedValue(jsm);
      const startTime = new Date('2026-09-01T00:00:00Z');

      await createReplayConsumer('TRADES', 'replay-1', startTime);

      expect(jsm.consumers.add).toHaveBeenCalledWith('TRADES', {
        durable_name: 'replay-1',
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.StartTime,
        opt_start_time: startTime.toISOString(),
      });
    });

    it('creates a durable consumer with All policy when no startTime', async () => {
      const jsm = makeMockJsm();
      mockNc.jetstreamManager.mockResolvedValue(jsm);

      await createReplayConsumer('SIGNALS', 'replay-all');

      expect(jsm.consumers.add).toHaveBeenCalledWith('SIGNALS', {
        durable_name: 'replay-all',
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        opt_start_time: undefined,
      });
    });
  });

  // ── buildOrderedConsumerConfig ────────────────────────────────────────────

  describe('buildOrderedConsumerConfig', () => {
    it('returns config with correct fields', () => {
      const cfg = buildOrderedConsumerConfig('signal.BTC-USDT');
      expect(cfg.ack_policy).toBe(AckPolicy.None);
      expect(cfg.deliver_policy).toBe(DeliverPolicy.Last);
      expect(cfg.filter_subject).toBe('signal.BTC-USDT');
      expect(cfg.max_deliver).toBe(1);
      expect(cfg.inactive_threshold).toBe(30e9);
    });

    it('does not include a durable_name (ephemeral)', () => {
      const cfg = buildOrderedConsumerConfig('test');
      expect(cfg.durable_name).toBeUndefined();
    });
  });

  // ── createOrderedConsumer ─────────────────────────────────────────────────

  describe('createOrderedConsumer', () => {
    it('creates consumer and returns NATS-assigned name', async () => {
      const jsm = makeMockJsm({
        consumersAdd: vi.fn().mockResolvedValue({ name: 'ordered-abc-123' }),
      });
      mockNc.jetstreamManager.mockResolvedValue(jsm);

      const name = await createOrderedConsumer('SIGNALS', 'signal.ETH-USDT');

      expect(name).toBe('ordered-abc-123');
      expect(jsm.consumers.add).toHaveBeenCalledWith('SIGNALS', expect.objectContaining({
        filter_subject: 'signal.ETH-USDT',
        ack_policy: AckPolicy.None,
        max_deliver: 1,
      }));
    });
  });

  // ── getConsumerSequence ───────────────────────────────────────────────────

  describe('getConsumerSequence', () => {
    it('returns stream_seq for an existing consumer', async () => {
      const jsm = makeMockJsm({
        consumersInfo: vi.fn().mockResolvedValue({ delivered: { stream_seq: 999 } }),
      });
      mockNc.jetstreamManager.mockResolvedValue(jsm);

      const seq = await getConsumerSequence('TRADES', 'my-consumer');
      expect(seq).toBe(999);
    });

    it('returns null when consumer not found (cleanup)', async () => {
      const jsm = makeMockJsm({
        consumersInfo: vi.fn().mockRejectedValue(new Error('consumer not found')),
      });
      mockNc.jetstreamManager.mockResolvedValue(jsm);

      const seq = await getConsumerSequence('TRADES', 'expired-consumer');
      expect(seq).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('consumer expired-consumer not found'),
        expect.any(Object),
      );
    });
  });
});
