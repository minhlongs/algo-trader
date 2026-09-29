/**
 * Telemetry Event Bus
 * Standardized typed event bus supporting in-memory pub/sub and distributed NATS topics.
 */

import { EventEmitter } from 'node:events';
import { logger } from '../../shared/utils/logger';

export interface TelemetryBusEvent {
  readonly topic: string;
  readonly payload: unknown;
  readonly timestamp: number;
}

export type TelemetryEventListener = (payload: unknown, event: TelemetryBusEvent) => void;

export const TELEMETRY_TOPICS = {
  SNAPSHOT: 'desk.telemetry.snapshot',
  PNL: 'desk.telemetry.pnl',
  MARGIN: 'desk.telemetry.margin',
  ALERT: 'desk.telemetry.alert',
  SOR: 'desk.telemetry.sor',
  EOD: 'desk.telemetry.eod',
} as const;

export type TelemetryTopic =
  | (typeof TELEMETRY_TOPICS)[keyof typeof TELEMETRY_TOPICS]
  | string;

export class TelemetryEventBus {
  private readonly emitter = new EventEmitter();
  private readonly events: TelemetryBusEvent[] = [];
  private natsPublisher: ((topic: string, payload: unknown) => Promise<void>) | null = null;

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  /**
   * Configures an optional external NATS or distributed message bus publisher.
   */
  public setNatsPublisher(publisher: (topic: string, payload: unknown) => Promise<void>): void {
    this.natsPublisher = publisher;
  }

  /**
   * Emits an event to local listeners and optional distributed bus.
   */
  public emit(topic: string, payload: unknown): void {
    const event: TelemetryBusEvent = {
      topic,
      payload,
      timestamp: Date.now(),
    };

    this.events.push(event);
    this.emitter.emit(topic, payload, event);
    this.emitter.emit('*', payload, event);

    if (this.natsPublisher && topic.startsWith('desk.telemetry.')) {
      this.natsPublisher(topic, payload).catch((err: unknown) => {
        logger.warn('Failed to publish telemetry event to distributed bus', {
          topic,
          error: String(err),
        });
      });
    }
  }

  /**
   * Retrieves recorded events with optional topic prefix filter.
   */
  public getEvents(topicFilter?: string): readonly TelemetryBusEvent[] {
    if (!topicFilter) {
      return [...this.events];
    }
    return this.events.filter((e) => e.topic.startsWith(topicFilter));
  }

  /**
   * Subscribes to events matching an exact topic or wildcard.
   */
  public on(topic: string, listener: TelemetryEventListener): () => void {
    this.emitter.on(topic, listener);
    return () => {
      this.emitter.off(topic, listener);
    };
  }

  /**
   * Subscribes once to an event.
   */
  public once(topic: string, listener: TelemetryEventListener): () => void {
    this.emitter.once(topic, listener);
    return () => {
      this.emitter.off(topic, listener);
    };
  }

  /**
   * Clears in-memory recorded event history.
   */
  public clearEvents(): void {
    this.events.length = 0;
  }
}
