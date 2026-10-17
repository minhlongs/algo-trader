/**
 * JetStream Stream & Consumer Configuration Helpers
 * Extracted from jetstream-manager.ts for modular stream provisioning and config building.
 */

import { RetentionPolicy, StorageType, AckPolicy, DeliverPolicy } from 'nats';
import type { JetStreamManager, ConsumerConfig } from 'nats';
import { logger } from '../utils/logger';

export interface StreamConfig {
  name: string;
  subjects: string[];
  maxAge: number; // nanoseconds
  maxBytes?: number;
  storage?: 'file' | 'memory';
}

export const STREAM_CONFIGS: StreamConfig[] = [
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
 * Build ConsumerConfig for an ordered push consumer on a single subject.
 *
 * Ordered guarantees:
 * - FIFO delivery per subject (DeliverPolicy.Last catches up from latest message)
 * - No redelivery (max_deliver: 1) — consensus votes are time-sensitive; stale retries skew results
 * - inactive_threshold: auto-deletes the ephemeral consumer after 30 s of idle
 */
export function buildOrderedConsumerConfig(filterSubject: string): Partial<ConsumerConfig> {
  return {
    ack_policy: AckPolicy.None,          // ordered consumers must not ack
    deliver_policy: DeliverPolicy.Last,  // start from the latest message, not the beginning
    filter_subject: filterSubject,
    max_deliver: 1,                      // no redelivery — consensus is point-in-time
    inactive_threshold: 30 * 1e9,        // 30 s in nanoseconds — auto-cleanup when idle
  };
}

export async function ensureStream(jsm: JetStreamManager, config: StreamConfig): Promise<void> {
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
    await jsm.streams.update(config.name, {
      subjects: config.subjects,
      max_age: config.maxAge,
      max_bytes: config.maxBytes || -1,
    });
    logger.info(`[JetStream] Updated stream: ${config.name}`);
  } catch {
    try {
      await jsm.streams.add(streamDef);
      logger.info(`[JetStream] Created stream: ${config.name}`);
    } catch (createErr) {
      logger.error(`[JetStream] Failed to create stream ${config.name}: ${(createErr as Error).message}`);
    }
  }
}
