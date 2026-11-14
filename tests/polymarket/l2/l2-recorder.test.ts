import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createL2Recorder } from '../../../src/desk/polymarket/l2/l2-recorder';
import type { RecordedL2Row } from '../../../src/desk/polymarket/l2/l2-event-types';

const TOKEN = '94592567375755535402382514854858851873438883868449100686326493803085500123190';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'l2-recorder-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function bookRow(t: number, bidPrice: string, bidSize: string): RecordedL2Row {
  return {
    t,
    source: 'recorded-l2',
    assetId: TOKEN,
    eventType: 'book',
    bids: [{ price: bidPrice, size: bidSize }],
    asks: [{ price: '0.99', size: '500' }],
  };
}

function parseLines(text: string): unknown[] {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

describe('createL2Recorder', () => {
  it('appends one JSON line per row, in order, with the recorded-l2 label', async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, 'nested', 'books.jsonl');
    const recorder = createL2Recorder({ filePath });

    await recorder.writeRows([bookRow(1_000, '0.10', '5'), bookRow(2_000, '0.11', '6')]);
    await recorder.close();

    const lines = parseLines(await readFile(filePath, 'utf8'));
    expect(lines).toHaveLength(2);
    expect(lines).toEqual([bookRow(1_000, '0.10', '5'), bookRow(2_000, '0.11', '6')]);
    expect(recorder.rowCount).toBe(2);
  });

  it('creates missing parent directories', async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, 'a', 'b', 'c', 'books.jsonl');
    const recorder = createL2Recorder({ filePath });

    await recorder.writeRows([bookRow(1_000, '0.10', '5')]);
    await recorder.close();

    expect(existsSync(filePath)).toBe(true);
  });

  it('is append-only: a second recorder adds rows without truncating the first run', async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, 'books.jsonl');

    const first = createL2Recorder({ filePath });
    await first.writeRows([bookRow(1_000, '0.10', '5')]);
    await first.close();

    const second = createL2Recorder({ filePath });
    await second.writeRows([bookRow(2_000, '0.11', '6')]);
    await second.close();

    expect(parseLines(await readFile(filePath, 'utf8'))).toHaveLength(2);
  });

  it('serialises concurrent writes without interleaving partial lines', async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, 'books.jsonl');
    const recorder = createL2Recorder({ filePath });

    await Promise.all([
      recorder.writeRows([bookRow(1_000, '0.10', '5')]),
      recorder.writeRows([bookRow(2_000, '0.11', '6')]),
      recorder.writeRows([bookRow(3_000, '0.12', '7')]),
    ]);
    await recorder.close();

    const lines = parseLines(readFileSync(filePath, 'utf8'));
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => (line as RecordedL2Row).t)).toEqual([1_000, 2_000, 3_000]);
  });

  it('normalises raw WebSocket frames and reports how many rows were written', async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, 'books.jsonl');
    const recorder = createL2Recorder({ filePath, now: () => 1_700_000_000_000 });

    const written = await recorder.recordRawMessage(
      JSON.stringify({ event_type: 'book', asset_id: TOKEN, bids: [{ price: '0.4', size: '9' }], asks: [] }),
    );
    expect(written).toBe(1);

    const ignored = await recorder.recordRawMessage(JSON.stringify({ event_type: 'last_trade_price', price: '0.5' }));
    expect(ignored).toBe(0);

    await recorder.close();
    const lines = parseLines(await readFile(filePath, 'utf8')) as RecordedL2Row[];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ t: 1_700_000_000_000, source: 'recorded-l2', assetId: TOKEN });
  });

  it('resolves close() only after every queued row is on disk, and close() is idempotent', async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, 'books.jsonl');
    const recorder = createL2Recorder({ filePath });

    for (let i = 0; i < 25; i += 1) void recorder.writeRows([bookRow(i, '0.10', String(i))]);
    await recorder.close();
    await recorder.close();

    expect(parseLines(await readFile(filePath, 'utf8'))).toHaveLength(25);
  });

  it('rejects writes after close instead of silently dropping rows', async () => {
    const dir = await makeTempDir();
    const recorder = createL2Recorder({ filePath: join(dir, 'books.jsonl') });

    await recorder.close();
    await expect(recorder.writeRows([bookRow(1_000, '0.10', '5')])).rejects.toThrow(/closed/);
  });

  it('throws (does not swallow) when the path cannot be written', async () => {
    const dir = await makeTempDir();
    // A regular file cannot act as a parent directory, so mkdirSync fails loudly.
    const blocker = join(dir, 'blocker');
    await writeFile(blocker, 'x');

    expect(() => createL2Recorder({ filePath: join(blocker, 'books.jsonl') })).toThrow();
  });
});
