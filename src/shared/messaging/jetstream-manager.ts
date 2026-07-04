/**
 * JetStream Manager
 * Persistent message streaming with replay capability for backtesting
 *
 * Streams:
 * - TRADES: all order events (30-day retention)
 * - SIGNALS: all signal detections (7-day retention)
 * - MARKET_DATA: market updates (24h retention, high volume)
 */

import { JetStreamClient, RetentionPolicy, StorageType, AckPolicy, DeliverPolicy } from 'nats';
import type { JetStreamManager, ConsumerConfig } from 'nats';
import { getNatsConnection } from './nats-connection-manager';
import { logger } from '../utils/logger';

export interface StreamConfig {
  name: string;
  subjects: string[];
  maxAge: number; // nanoseconds
  maxBytes?: number;
  storage?: 'file' | 'memory';
}

const STREAM_CONFIGS: StreamConfig[] = [
  {
    name: 'TRADES',
    subjects: ['order.>'],
    maxAge: 30 * 24 * 60 * 60 * 1e9, // 30 days
    storage: 'file',
  },
  {
    name: 'SIGNALS',
    subjects: ['signal.>'],
    maxAge: 7 * 24 * 60 * 60 * 1e9, // 7 days
    storage: 'file',
  },
  {
    name: 'MARKET_DATA',
    subjects: ['market.>'],
    maxAge: 24 * 60 * 60 * 1e9, // 24 hours
    maxBytes: 1024 * 1024 * 512, // 512MB cap
    storage: 'memory',
  },
];

/**
 * Initialize JetStream streams
 * Creates or updates stream configurations
 */
export async function initializeJetStreams(): Promise<void> {
  const nc = getNatsConnection();
  const jsm = await nc.jetstreamManager();

  for (const config of STREAM_CONFIGS) {
    await ensureStream(jsm, config);
  }

  logger.info(`[JetStream] Initialized ${STREAM_CONFIGS.length} streams`);
}

/** Get JetStream client for publishing/consuming */
export function getJetStreamClient(): JetStreamClient {
  const nc = getNatsConnection();
  return nc.jetstream();
}

/** Create a durable consumer for replaying messages */
export async function createReplayConsumer(
  streamName: string,
  consumerName: string,
  startTime?: Date
): Promise<void> {
  const nc = getNatsConnection();
  const jsm = await nc.jetstreamManager();

  await jsm.consumers.add(streamName, {
    durable_name: consumerName,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: startTime ? DeliverPolicy.StartTime : DeliverPolicy.All,
    opt_start_time: startTime?.toISOString(),
  });

  logger.info(`[JetStream] Consumer ${consumerName} created on ${streamName}`);
}

/**
 * Build ConsumerConfig for an ordered push consumer on a single subject.
 *
 * Ordered guarantees:
 * - FIFO delivery per subject (DeliverPolicy.Last catches up from latest message)
 * - No redelivery (max_deliver: 1) — consensus votes are time-sensitive; stale retries skew results
 * - inactive_threshold: auto-deletes the ephemeral consumer after 30 s of idle
 *
 * The caller is responsible for adding the consumer via jsm.consumers.add().
 * Returning the config object (not void) makes the factory unit-testable without a live NATS server.
 */
export function buildOrderedConsumerConfig(filterSubject: string): Partial<ConsumerConfig> {
  return {
    // No durable_name — ephemeral consumer; NATS auto-assigns a name
    ack_policy: AckPolicy.None,          // ordered consumers must not ack
    deliver_policy: DeliverPolicy.Last,  // start from the latest message, not the beginning
    filter_subject: filterSubject,
    max_deliver: 1,                      // no redelivery — consensus is point-in-time
    inactive_threshold: 30 * 1e9,        // 30 s in nanoseconds — auto-cleanup when idle
  };
}

/**
 * Create an ordered push consumer scoped to a single subject.
 * Returns the NATS-assigned consumer name for use with getConsumerSequence().
 *
 * Use for consensus-critical subscribers (signal-consensus-swarm) where
 * out-of-order delivery would cause stale signal evaluation.
 */
export async function createOrderedConsumer(
  streamName: string,
  filterSubject: string,
): Promise<string> {
  const nc = getNatsConnection();
  const jsm = await nc.jetstreamManager();
  const cfg = buildOrderedConsumerConfig(filterSubject);

  const info = await jsm.consumers.add(streamName, cfg);
  const consumerName = info.name;

  logger.info(`[JetStream] Ordered consumer ${consumerName} created on ${streamName} subject=${filterSubject}`);
  return consumerName;
}

/**
 * Return the last delivered stream sequence number for lag monitoring.
 * A growing gap between this and the stream's last_seq indicates consumer lag.
 * Returns null if the consumer is not found (already cleaned up after inactivity).
 */
export async function getConsumerSequence(
  streamName: string,
  consumerName: string,
): Promise<number | null> {
  const nc = getNatsConnection();
  const jsm = await nc.jetstreamManager();

  try {
    const info = await jsm.consumers.info(streamName, consumerName);
    return info.delivered.stream_seq;
  } catch (err) {
    logger.warn(`[JetStream] getConsumerSequence: consumer ${consumerName} not found on ${streamName}`, {
      error: (err as Error).message,
    });
    return null;
  }
}

async function ensureStream(jsm: JetStreamManager, config: StreamConfig): Promise<void> {
  const storageType = config.storage === 'memory' ? StorageType.Memory : StorageType.File;

  const streamDef = {
    name: config.name,
    subjects: config.subjects,
    retention: RetentionPolicy.Limits,
    max_age: config.maxAge,
    max_bytes: config.maxBytes || -1,
    storage: storageType,
  };

  try {
    await jsm.streams.info(config.name);
    // Stream exists — update mutable fields only
    await jsm.streams.update(config.name, {
      subjects: config.subjects,
      max_age: config.maxAge,
      max_bytes: config.maxBytes || -1,
    });
    logger.info(`[JetStream] Updated stream: ${config.name}`);
  } catch {
    // Stream doesn't exist — create with full config
    try {
      await jsm.streams.add(streamDef);
      logger.info(`[JetStream] Created stream: ${config.name}`);
    } catch (createErr) {
      logger.error(`[JetStream] Failed to create stream ${config.name}: ${(createErr as Error).message}`);
    }
  }
}
