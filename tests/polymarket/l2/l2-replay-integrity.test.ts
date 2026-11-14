import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readL2Rows, L2ReplayError } from '../../../src/desk/polymarket/l2/l2-replay';
import type { RecordedL2Row } from '../../../src/desk/polymarket/l2/l2-event-types';
import { TOKEN, cleanupTempDirs, makeTempDir, recordFrames } from './l2-test-fixtures';

afterEach(cleanupTempDirs);

const BASE_ROW: Omit<RecordedL2Row, 't'> = {
  source: 'recorded-l2',
  assetId: TOKEN,
  eventType: 'price_change',
  bids: [{ price: '0.5', size: '1' }],
  asks: [],
};

describe('l2 log integrity', () => {
  it('round-trips through the file byte-for-byte at the row level', async () => {
    const filePath = await recordFrames(await makeTempDir());

    const written = (await readFile(filePath, 'utf8'))
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));

    expect(await readL2Rows(filePath)).toEqual(written);
  });

  it('sorts rows by timestamp even when the log lines are out of order', async () => {
    const filePath = join(await makeTempDir(), 'unordered.jsonl');
    const lines = [
      { ...BASE_ROW, t: 3_000 },
      { ...BASE_ROW, t: 1_000 },
      { ...BASE_ROW, t: 2_000 },
    ];
    await writeFile(filePath, lines.map((line) => JSON.stringify(line)).join('\n'), 'utf8');

    expect((await readL2Rows(filePath)).map((row) => row.t)).toEqual([1_000, 2_000, 3_000]);
  });

  it('keeps file order for rows sharing a timestamp', async () => {
    const filePath = join(await makeTempDir(), 'same-ms.jsonl');
    const lines = [
      { ...BASE_ROW, t: 1_000, bids: [{ price: '0.10', size: '1' }] },
      { ...BASE_ROW, t: 1_000, bids: [{ price: '0.20', size: '1' }] },
    ];
    await writeFile(filePath, lines.map((line) => JSON.stringify(line)).join('\n'), 'utf8');

    const rows = await readL2Rows(filePath);
    expect(rows.map((row) => row.bids[0].price)).toEqual(['0.10', '0.20']);
  });

  it('skips blank lines', async () => {
    const filePath = join(await makeTempDir(), 'blank.jsonl');
    await writeFile(filePath, `${JSON.stringify({ ...BASE_ROW, t: 1_000 })}\n\n\n`, 'utf8');

    await expect(readL2Rows(filePath)).resolves.toHaveLength(1);
  });

  it('rejects a malformed line with its line number instead of guessing', async () => {
    const filePath = join(await makeTempDir(), 'broken.jsonl');
    await writeFile(filePath, `${JSON.stringify({ ...BASE_ROW, t: 1_000 })}\n{"t":2000,"source":"reco`, 'utf8');

    await expect(readL2Rows(filePath)).rejects.toBeInstanceOf(L2ReplayError);
    await expect(readL2Rows(filePath)).rejects.toThrow(/line 2/);
  });

  it('rejects rows whose source label is not recorded-l2', async () => {
    const filePath = join(await makeTempDir(), 'labelled.jsonl');
    await writeFile(filePath, JSON.stringify({ ...BASE_ROW, source: 'prices-history', t: 1_000 }), 'utf8');

    await expect(readL2Rows(filePath)).rejects.toThrow(L2ReplayError);
  });

  it('rejects rows missing the book fields the replay needs', async () => {
    const filePath = join(await makeTempDir(), 'missing.jsonl');
    await writeFile(filePath, JSON.stringify({ t: 1_000, source: 'recorded-l2', assetId: TOKEN }), 'utf8');

    await expect(readL2Rows(filePath)).rejects.toThrow(L2ReplayError);
  });
});
