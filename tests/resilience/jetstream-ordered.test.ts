/**
 * Unit tests for JetStream ordered consumer factory.
 * All NATS I/O is mocked — tests validate config generation and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AckPolicy, DeliverPolicy } from 'nats';

// --- Mock NATS connection manager ---
const mockConsumersAdd = vi.fn();
const mockConsumersInfo = vi.fn();
const mockJsm = {
  consumers: {
    add: mockConsumersAdd,
    info: mockConsumersInfo,
  },
};
const mockNc = {
  jetstreamManager: vi.fn().mockResolvedValue(mockJsm),
};

vi.mock('../../src/shared/messaging/nats-connection-manager', () => ({
  getNatsConnection: () => mockNc,
}));

vi.mock('../../src/shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
    getLevel: vi.fn(),
  },
}));

// Import after mocks are set up
import {
  buildOrderedConsumerConfig,
  createOrderedConsumer,
  getConsumerSequence,
} from '../../src/shared/messaging/jetstream-manager';

// ──────────────────────────────────────────────────────────────────────────────
// buildOrderedConsumerConfig — pure config generation, no I/O
// ──────────────────────────────────────────────────────────────────────────────

describe('buildOrderedConsumerConfig', () => {
  it('sets ack_policy to None (required for ordered consumers)', () => {
    const cfg = buildOrderedConsumerConfig('signal.BTC');
    expect(cfg.ack_policy).toBe(AckPolicy.None);
  });

  it('sets deliver_policy to Last (catch up from latest, not beginning)', () => {
    const cfg = buildOrderedConsumerConfig('signal.BTC');
    expect(cfg.deliver_policy).toBe(DeliverPolicy.Last);
  });

  it('sets max_deliver to 1 (no redelivery — consensus is time-sensitive)', () => {
    const cfg = buildOrderedConsumerConfig('signal.ETH');
    expect(cfg.max_deliver).toBe(1);
  });

  it('sets inactive_threshold to 30 seconds in nanoseconds', () => {
    const cfg = buildOrderedConsumerConfig('signal.SOL');
    expect(cfg.inactive_threshold).toBe(30 * 1e9);
  });

  it('sets filter_subject to the provided subject', () => {
    const cfg = buildOrderedConsumerConfig('signal.arb.polymarket');
    expect(cfg.filter_subject).toBe('signal.arb.polymarket');
  });

  it('does not set durable_name (ephemeral consumer)', () => {
    const cfg = buildOrderedConsumerConfig('signal.BTC');
    expect((cfg as Record<string, unknown>)['durable_name']).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// createOrderedConsumer — wraps jsm.consumers.add and returns consumer name
// ──────────────────────────────────────────────────────────────────────────────

describe('createOrderedConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the NATS-assigned consumer name', async () => {
    mockConsumersAdd.mockResolvedValue({ name: 'auto-abc123', delivered: { stream_seq: 0, consumer_seq: 0 } });

    const name = await createOrderedConsumer('SIGNALS', 'signal.BTC');
    expect(name).toBe('auto-abc123');
  });

  it('calls jsm.consumers.add with correct stream and config', async () => {
    mockConsumersAdd.mockResolvedValue({ name: 'auto-xyz', delivered: { stream_seq: 0, consumer_seq: 0 } });

    await createOrderedConsumer('SIGNALS', 'signal.ETH');

    expect(mockConsumersAdd).toHaveBeenCalledOnce();
    const [stream, cfg] = mockConsumersAdd.mock.calls[0] as [string, ReturnType<typeof buildOrderedConsumerConfig>];
    expect(stream).toBe('SIGNALS');
    expect(cfg.filter_subject).toBe('signal.ETH');
    expect(cfg.max_deliver).toBe(1);
    expect(cfg.ack_policy).toBe(AckPolicy.None);
  });

  it('propagates error from jsm.consumers.add', async () => {
    mockConsumersAdd.mockRejectedValue(new Error('stream not found'));

    await expect(createOrderedConsumer('SIGNALS', 'signal.BTC')).rejects.toThrow('stream not found');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getConsumerSequence — lag monitoring helper
// ──────────────────────────────────────────────────────────────────────────────

describe('getConsumerSequence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns delivered stream_seq on success', async () => {
    mockConsumersInfo.mockResolvedValue({
      name: 'auto-abc123',
      delivered: { stream_seq: 42, consumer_seq: 5 },
    });

    const seq = await getConsumerSequence('SIGNALS', 'auto-abc123');
    expect(seq).toBe(42);
  });

  it('calls jsm.consumers.info with correct stream and consumer name', async () => {
    mockConsumersInfo.mockResolvedValue({
      name: 'auto-abc123',
      delivered: { stream_seq: 10, consumer_seq: 1 },
    });

    await getConsumerSequence('SIGNALS', 'auto-abc123');

    expect(mockConsumersInfo).toHaveBeenCalledWith('SIGNALS', 'auto-abc123');
  });

  it('returns null when consumer is not found (cleaned up after inactivity)', async () => {
    mockConsumersInfo.mockRejectedValue(new Error('consumer not found'));

    const seq = await getConsumerSequence('SIGNALS', 'auto-stale');
    expect(seq).toBeNull();
  });

  it('returns null for any consumer lookup error (not just "not found")', async () => {
    mockConsumersInfo.mockRejectedValue(new Error('connection timeout'));

    const seq = await getConsumerSequence('SIGNALS', 'auto-timeout');
    expect(seq).toBeNull();
  });
});
