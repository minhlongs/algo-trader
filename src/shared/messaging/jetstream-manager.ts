/**
 * JetStream Manager
 * Persistent message streaming with replay capability for backtesting
 *
 * Streams:
 * - TRADES: all order events (30-day retention)
 * - SIGNALS: all signal detections (7-day retention)
 * - MARKET_DATA: market updates (24h retention, high volume)
 */

import { JetStreamClient, AckPolicy, DeliverPolicy } from 'nats';
import { getNatsConnection } from './nats-connection-manager';
import { logger } from '../utils/logger';
import {
  type StreamConfig,
  STREAM_CONFIGS,
  buildOrderedConsumerConfig,
  ensureStream,
} from './jetstream-stream-helpers';

export type { StreamConfig };
export { STREAM_CONFIGS, buildOrderedConsumerConfig, ensureStream };

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
