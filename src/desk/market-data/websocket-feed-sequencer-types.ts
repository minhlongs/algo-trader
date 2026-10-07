/**
 * WebSocket Feed Sequencer Types
 *
 * Contracts for sequencing real-time market data packets,
 * detecting missing message gaps, and triggering snapshot resyncs.
 *
 * @module desk/market-data/websocket-feed-sequencer-types
 */

export interface FeedPacket<T = unknown> {
  readonly channel: string;
  readonly sequence: number;
  readonly timestamp: number;
  readonly payload: T;
}

export interface SequenceGapAlert {
  readonly channel: string;
  readonly expectedSequence: number;
  readonly receivedSequence: number;
  readonly missingCount: number;
  readonly timestamp: number;
}

export interface SequencerState {
  readonly channel: string;
  readonly lastDispatchedSequence: number;
  readonly bufferedPacketCount: number;
  readonly hasActiveGap: boolean;
}
