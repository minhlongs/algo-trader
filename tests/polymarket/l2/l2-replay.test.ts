import { describe, it, expect, afterEach } from 'vitest';
import { replayL2Log, replayRows, readL2Rows } from '../../../src/desk/polymarket/l2/l2-replay';
import { isL2SourceLabel } from '../../../src/desk/polymarket/l2/l2-source-labels';
import type { ReplayedL2Book } from '../../../src/desk/polymarket/l2/l2-event-types';
import {
  OTHER_TOKEN,
  TOKEN,
  cleanupTempDirs,
  makeTempDir,
  recordFrames,
} from './l2-test-fixtures';

afterEach(cleanupTempDirs);

function stripRows(steps: Awaited<ReturnType<typeof replayL2Log>>): ReplayedL2Book[] {
  return steps.map(({ row: _row, ...book }) => book);
}

/** The books the recorder saw, recomputed from the rows it wrote. */
async function recordedBooks(filePath: string): Promise<ReplayedL2Book[]> {
  return replayRows(await readL2Rows(filePath)).map(({ row: _row, ...book }) => book);
}

describe('l2 replay', () => {
  it('replays a recorded session to books deep-equal to the recorded sequence', async () => {
    const filePath = await recordFrames(await makeTempDir());

    const replayed = stripRows(await replayL2Log(filePath));

    expect(replayed.length).toBeGreaterThan(0);
    expect(replayed).toEqual(await recordedBooks(filePath));
  });

  it('reproduces a hand-written expected book sequence, end to end from disk', async () => {
    const filePath = await recordFrames(await makeTempDir());

    const expected: ReplayedL2Book[] = [
      {
        t: 1794488052636,
        source: 'recorded-l2',
        assetId: TOKEN,
        eventType: 'book',
        bids: [
          { price: '0.39', size: '2472.83' },
          { price: '0.38', size: '900' },
          { price: '0.01', size: '29918.02' },
        ],
        asks: [
          { price: '0.99', size: '24807.96' },
          { price: '0.41', size: '300' },
          { price: '0.40', size: '11564.26' },
        ],
        tickSize: '0.01',
      },
      {
        t: 1794488052754,
        source: 'recorded-l2',
        assetId: TOKEN,
        eventType: 'price_change',
        bids: [
          { price: '0.39', size: '2472.83' },
          { price: '0.38', size: '900' },
          { price: '0.01', size: '29918.02' },
        ],
        asks: [
          { price: '0.99', size: '24807.96' },
          { price: '0.41', size: '300' },
        ],
      },
      {
        t: 1794488053000,
        source: 'recorded-l2',
        assetId: TOKEN,
        eventType: 'price_change',
        bids: [
          { price: '0.395', size: '1200' },
          { price: '0.39', size: '2472.83' },
          { price: '0.38', size: '900' },
          { price: '0.01', size: '29918.02' },
        ],
        asks: [
          { price: '0.99', size: '24807.96' },
          { price: '0.41', size: '300' },
        ],
      },
      {
        t: 1794488054000,
        source: 'recorded-l2',
        assetId: TOKEN,
        eventType: 'price_change',
        bids: [
          { price: '0.395', size: '1200' },
          { price: '0.39', size: '2472.83' },
          { price: '0.01', size: '29918.02' },
        ],
        asks: [
          { price: '0.99', size: '24807.96' },
          { price: '0.41', size: '300' },
        ],
      },
    ];

    expect(stripRows(await replayL2Log(filePath, { assetId: TOKEN }))).toEqual(expected);

    expect(stripRows(await replayL2Log(filePath, { assetId: OTHER_TOKEN }))).toEqual([
      {
        t: 1794488052754,
        source: 'recorded-l2',
        assetId: OTHER_TOKEN,
        eventType: 'price_change',
        bids: [{ price: '0.60', size: '11414.26' }],
        asks: [],
      },
      {
        t: 1794488053500,
        source: 'recorded-l2',
        assetId: OTHER_TOKEN,
        eventType: 'book',
        bids: [{ price: '0.59', size: '50' }],
        asks: [{ price: '0.61', size: '60' }],
        tickSize: undefined,
        lastTradePrice: undefined,
      },
    ]);
  });

  it('applies deltas onto the snapshot ladder exactly as the exchange would', async () => {
    const filePath = await recordFrames(await makeTempDir());
    const steps = await replayL2Log(filePath, { assetId: TOKEN });

    // Size-0 removes a level; a new price is inserted in descending-price position.
    expect(steps[1].asks.map((level) => level.price)).toEqual(['0.99', '0.41']);
    expect(steps[2].bids.map((level) => level.price)).toEqual(['0.395', '0.39', '0.38', '0.01']);
    expect(steps[3].bids.map((level) => level.price)).toEqual(['0.395', '0.39', '0.01']);
    expect(steps).toHaveLength(4); // 5 frames, one belongs to OTHER_TOKEN
  });

  it('keeps one independent book per asset and never lets a delta create a book from nothing', async () => {
    const filePath = await recordFrames(await makeTempDir());

    const other = await replayL2Log(filePath, { assetId: OTHER_TOKEN });
    expect(other.map((step) => step.eventType)).toEqual(['price_change', 'book']);
    expect(other[0].bids).toEqual([{ price: '0.60', size: '11414.26' }]);
    expect(other[0].asks).toEqual([]);
    expect(other[1].bids).toEqual([{ price: '0.59', size: '50' }]);
  });

  it('carries the source label on every replayed book', async () => {
    const filePath = await recordFrames(await makeTempDir());

    const steps = await replayL2Log(filePath);
    expect(steps.every((step) => step.source === 'recorded-l2')).toBe(true);
    expect(steps.every((step) => isL2SourceLabel(step.source))).toBe(true);

    const rows = await readL2Rows(filePath);
    expect(rows.every((row) => row.source === 'recorded-l2')).toBe(true);
  });

  it('emits books in timestamp order and preserves exchange timestamps', async () => {
    const filePath = await recordFrames(await makeTempDir());

    const times = (await replayL2Log(filePath)).map((step) => step.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times[0]).toBe(1794488052636);
  });

  it('returns no books when the asset never appears in the log', async () => {
    const filePath = await recordFrames(await makeTempDir());
    await expect(replayL2Log(filePath, { assetId: 'unknown-token' })).resolves.toEqual([]);
  });
});
