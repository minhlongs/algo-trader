/**
 * Resilient WebSocket Stream Multiplexer
 * Tracks sequence gaps, buffers messages, and monitors backpressure.
 *
 * @module desk/edge/ws-stream-multiplexer
 */

import { StreamMessage, MultiplexerStats } from './edge-hft-types';

export class WsStreamMultiplexer {
  private readonly bufferCapacity: number;
  private readonly messageBuffer: StreamMessage[] = [];
  private readonly lastSeqByStream = new Map<string, number>();
  private totalProcessed = 0;
  private gapsDetected = 0;

  public constructor(bufferCapacity = 1000) {
    this.bufferCapacity = Math.max(10, bufferCapacity);
  }

  public ingestMessage(msg: StreamMessage): { isSequenceValid: boolean; gapSize: number } {
    this.totalProcessed += 1;
    const streamKey = `${msg.venue}:${msg.streamId}`;
    const lastSeq = this.lastSeqByStream.get(streamKey);

    let isSequenceValid = true;
    let gapSize = 0;

    if (lastSeq !== undefined) {
      if (msg.sequenceNumber > lastSeq + 1) {
        gapSize = msg.sequenceNumber - (lastSeq + 1);
        this.gapsDetected += 1;
        isSequenceValid = false;
      }
    }

    this.lastSeqByStream.set(streamKey, msg.sequenceNumber);

    if (this.messageBuffer.length >= this.bufferCapacity) {
      this.messageBuffer.shift(); // Evict oldest
    }
    this.messageBuffer.push(msg);

    return { isSequenceValid, gapSize };
  }

  public drainMessages(count: number): StreamMessage[] {
    const drainCount = Math.min(count, this.messageBuffer.length);
    return this.messageBuffer.splice(0, drainCount);
  }

  public getStats(): MultiplexerStats {
    return {
      totalMessagesProcessed: this.totalProcessed,
      sequenceGapsDetected: this.gapsDetected,
      bufferUtilizationPct: Math.round((this.messageBuffer.length / this.bufferCapacity) * 100),
      activeStreamsCount: this.lastSeqByStream.size,
    };
  }

  public resetStream(venue: string, streamId: string): void {
    this.lastSeqByStream.delete(`${venue}:${streamId}`);
  }
}
