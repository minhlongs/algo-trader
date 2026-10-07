import { describe, it, expect, vi } from 'vitest';
import { WebSocketFeedSequencer } from '../../../../src/desk/market-data/websocket-feed-sequencer';
import type { FeedPacket, SequenceGapAlert } from '../../../../src/desk/market-data/websocket-feed-sequencer-types';

describe('WebSocketFeedSequencer', () => {
  it('dispatches sequential packets in monotonic order', () => {
    const sequencer = new WebSocketFeedSequencer<string>({ channel: 'orderbook:ETH' });
    const p1: FeedPacket<string> = { channel: 'orderbook:ETH', sequence: 1, timestamp: 1000, payload: 'data1' };
    const p2: FeedPacket<string> = { channel: 'orderbook:ETH', sequence: 2, timestamp: 1001, payload: 'data2' };

    const out1 = sequencer.ingest(p1);
    expect(out1).toHaveLength(1);
    expect(out1[0]?.payload).toBe('data1');

    const out2 = sequencer.ingest(p2);
    expect(out2).toHaveLength(1);
    expect(out2[0]?.payload).toBe('data2');

    expect(sequencer.getState().lastDispatchedSequence).toBe(2);
    expect(sequencer.getState().bufferedPacketCount).toBe(0);
  });

  it('buffers out-of-order packets and releases once gap is filled', () => {
    const sequencer = new WebSocketFeedSequencer<string>({ channel: 'orderbook:BTC' });
    const p1: FeedPacket<string> = { channel: 'orderbook:BTC', sequence: 1, timestamp: 1000, payload: 'data1' };
    const p2: FeedPacket<string> = { channel: 'orderbook:BTC', sequence: 2, timestamp: 1001, payload: 'data2' };
    const p3: FeedPacket<string> = { channel: 'orderbook:BTC', sequence: 3, timestamp: 1002, payload: 'data3' };

    // Ingest p1, then p3 (gap: expected 2, received 3)
    sequencer.ingest(p1);
    const gapSpy = vi.fn();
    sequencer.on('gapDetected', gapSpy);

    const out3 = sequencer.ingest(p3);
    expect(out3).toHaveLength(0);
    expect(gapSpy).toHaveBeenCalledWith(expect.objectContaining<Partial<SequenceGapAlert>>({
      expectedSequence: 2,
      receivedSequence: 3,
      missingCount: 1,
    }));
    expect(sequencer.getState().hasActiveGap).toBe(true);

    // Now arrive p2, both p2 and p3 should dispatch in order
    const out2 = sequencer.ingest(p2);
    expect(out2).toHaveLength(2);
    expect(out2.map(p => p.sequence)).toEqual([2, 3]);
    expect(sequencer.getState().lastDispatchedSequence).toBe(3);
    expect(sequencer.getState().hasActiveGap).toBe(false);
  });

  it('discards stale or duplicate sequence packets', () => {
    const sequencer = new WebSocketFeedSequencer<string>({ channel: 'orderbook:SOL' });
    const p1: FeedPacket<string> = { channel: 'orderbook:SOL', sequence: 1, timestamp: 1000, payload: 'data1' };
    sequencer.ingest(p1);

    const dup = sequencer.ingest(p1);
    expect(dup).toHaveLength(0);
    expect(sequencer.getState().lastDispatchedSequence).toBe(1);
  });

  it('resyncs state with a snapshot sequence', () => {
    const sequencer = new WebSocketFeedSequencer<string>({ channel: 'orderbook:AVAX' });
    sequencer.resyncSnapshot(100);

    expect(sequencer.getState().lastDispatchedSequence).toBe(100);

    const p101: FeedPacket<string> = {
      channel: 'orderbook:AVAX',
      sequence: 101,
      timestamp: 1000,
      payload: 'snapshot+1',
    };
    const out = sequencer.ingest(p101);
    expect(out).toHaveLength(1);
    expect(out[0]?.sequence).toBe(101);
  });

  it('emits snapshotResyncRequired on buffer overflow', () => {
    const sequencer = new WebSocketFeedSequencer<string>({
      channel: 'orderbook:DOGE',
      maxBufferSize: 2,
    });
    const overflowSpy = vi.fn();
    sequencer.on('snapshotResyncRequired', overflowSpy);

    // Expecting 1, send 10, 11, 12
    sequencer.ingest({ channel: 'orderbook:DOGE', sequence: 10, timestamp: 1, payload: 'p10' });
    sequencer.ingest({ channel: 'orderbook:DOGE', sequence: 11, timestamp: 2, payload: 'p11' });
    sequencer.ingest({ channel: 'orderbook:DOGE', sequence: 12, timestamp: 3, payload: 'p12' });

    expect(overflowSpy).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'orderbook:DOGE',
      reason: 'BUFFER_OVERFLOW',
    }));
  });
});
