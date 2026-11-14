/**
 * Replay a point-in-time L2 JSONL log back into the book sequence that was recorded.
 *
 * `readL2Rows` streams the file and returns every valid `recorded-l2` row in file
 * order (malformed lines are rejected, not silently coerced). `replayL2Log` folds
 * those rows into books:
 *
 * - `book`         replaces the book for that asset.
 * - `price_change` upserts (`size > 0`) or removes (`size === '0'`) one level on the
 *                  bid ladder for `side: 'BUY'` semantics, the ask ladder otherwise.
 *
 * Each emitted book keeps exchange ordering (descending price on both sides) and the
 * row's own `source` label, so a consumer can verify it is replaying observed data.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { isRecordedL2Row, type L2PriceLevel, type RecordedL2Row, type ReplayedL2Book } from './l2-event-types';

export class L2ReplayError extends Error {
  readonly lineNumber: number;

  constructor(message: string, lineNumber: number) {
    super(`${message} (line ${lineNumber})`);
    this.name = 'L2ReplayError';
    this.lineNumber = lineNumber;
  }
}

export interface ReplayOptions {
  /** Only replay rows for this token. Defaults to every asset in the log. */
  assetId?: string;
}

export interface ReplayedBookStep extends ReplayedL2Book {
  row: RecordedL2Row;
}

function comparePriceDescending(a: L2PriceLevel, b: L2PriceLevel): number {
  return Number(b.price) - Number(a.price);
}

function applyLevel(side: L2PriceLevel[], level: L2PriceLevel): void {
  const index = side.findIndex((existing) => Number(existing.price) === Number(level.price));
  if (Number(level.size) === 0) {
    if (index >= 0) side.splice(index, 1);
    return;
  }
  if (index >= 0) {
    side[index] = { ...level };
  } else {
    side.push({ ...level });
  }
  side.sort(comparePriceDescending);
}

/**
 * Fold rows into books, emitting one book per row in input order.
 * Rows must already be in timestamp order; use `readL2Rows` for that guarantee.
 */
export function replayRows(rows: readonly RecordedL2Row[], options: ReplayOptions = {}): ReplayedBookStep[] {
  const books = new Map<string, { bids: L2PriceLevel[]; asks: L2PriceLevel[] }>();
  const steps: ReplayedBookStep[] = [];

  for (const row of rows) {
    if (options.assetId !== undefined && row.assetId !== options.assetId) continue;

    const current = books.get(row.assetId);
    let bids: L2PriceLevel[];
    let asks: L2PriceLevel[];

    if (row.eventType === 'book') {
      bids = row.bids.map((level) => ({ ...level })).sort(comparePriceDescending);
      asks = row.asks.map((level) => ({ ...level })).sort(comparePriceDescending);
    } else {
      bids = (current?.bids ?? []).map((level) => ({ ...level }));
      asks = (current?.asks ?? []).map((level) => ({ ...level }));
      for (const level of row.bids) applyLevel(bids, level);
      for (const level of row.asks) applyLevel(asks, level);
    }

    books.set(row.assetId, { bids, asks });
    steps.push({
      t: row.t,
      source: row.source,
      assetId: row.assetId,
      eventType: row.eventType,
      bids: bids.map((level) => ({ ...level })),
      asks: asks.map((level) => ({ ...level })),
      tickSize: row.tickSize,
      lastTradePrice: row.lastTradePrice,
      row,
    });
  }

  return steps;
}

/** Stream a JSONL log into validated rows, ordered by `t` (stable for equal timestamps). */
export async function readL2Rows(filePath: string): Promise<RecordedL2Row[]> {
  const rows: Array<{ row: RecordedL2Row; index: number }> = [];
  const lines = createInterface({ input: createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim().length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new L2ReplayError('Malformed JSON line', lineNumber);
    }
    if (!isRecordedL2Row(parsed)) {
      throw new L2ReplayError('Line is not a recorded-l2 row', lineNumber);
    }
    rows.push({ row: parsed, index: rows.length });
  }

  rows.sort((a, b) => a.row.t - b.row.t || a.index - b.index);
  return rows.map((entry) => entry.row);
}

/** Read a log and replay it. Throws `L2ReplayError` on a malformed line. */
export async function replayL2Log(filePath: string, options: ReplayOptions = {}): Promise<ReplayedBookStep[]> {
  return replayRows(await readL2Rows(filePath), options);
}
