import { EventEmitter } from 'node:events';
import type {
  FeedPacket,
  SequenceGapAlert,
  SequencerState,
} from './websocket-feed-sequencer-types';

export interface WebSocketFeedSequencerConfig {
  readonly channel: string;
  readonly initialSequence?: number;
  readonly maxBufferSize?: number;
}

export class WebSocketFeedSequencer<T = unknown> extends EventEmitter {
  private readonly channel: string;
  private readonly maxBufferSize: number;
  private expectedSequence: number;
  private lastDispatchedSequence: number;
  private readonly buffer: Map<number, FeedPacket<T>> = new Map();

  public constructor(config: WebSocketFeedSequencerConfig) {
    super();
    this.channel = config.channel;
    this.expectedSequence = config.initialSequence ?? 1;
    this.lastDispatchedSequence = (config.initialSequence ?? 1) - 1;
    this.maxBufferSize = config.maxBufferSize ?? 500;
  }

  public ingest(packet: FeedPacket<T>): readonly FeedPacket<T>[] {
    if (packet.channel !== this.channel) {
      return [];
    }

    if (packet.sequence < this.expectedSequence) {
      // Stale or duplicate packet, discard
      return [];
    }

    if (packet.sequence > this.expectedSequence) {
      this.buffer.set(packet.sequence, packet);
      const gap: SequenceGapAlert = {
        channel: this.channel,
        expectedSequence: this.expectedSequence,
        receivedSequence: packet.sequence,
        missingCount: packet.sequence - this.expectedSequence,
        timestamp: Date.now(),
      };
      this.emit('gapDetected', gap);

      if (this.buffer.size > this.maxBufferSize) {
        this.emit('snapshotResyncRequired', {
          channel: this.channel,
          reason: 'BUFFER_OVERFLOW',
          bufferSize: this.buffer.size,
          expectedSequence: this.expectedSequence,
        });
      }
      return [];
    }

    // packet.sequence === this.expectedSequence
    const dispatched: FeedPacket<T>[] = [];
    this.buffer.set(packet.sequence, packet);

    while (this.buffer.has(this.expectedSequence)) {
      const nextPacket = this.buffer.get(this.expectedSequence);
      if (!nextPacket) break;
      this.buffer.delete(this.expectedSequence);
      this.lastDispatchedSequence = this.expectedSequence;
      this.expectedSequence += 1;
      dispatched.push(nextPacket);
      this.emit('packetDispatched', nextPacket);
    }

    return dispatched;
  }

  public resyncSnapshot(snapshotSequence: number): void {
    this.expectedSequence = snapshotSequence + 1;
    this.lastDispatchedSequence = snapshotSequence;
    for (const seq of Array.from(this.buffer.keys())) {
      if (seq <= snapshotSequence) {
        this.buffer.delete(seq);
      }
    }
  }

  public getState(): SequencerState {
    return {
      channel: this.channel,
      lastDispatchedSequence: this.lastDispatchedSequence,
      bufferedPacketCount: this.buffer.size,
      hasActiveGap: this.buffer.size > 0 && !this.buffer.has(this.expectedSequence),
    };
  }
}
