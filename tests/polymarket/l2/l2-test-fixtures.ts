/**
 * Shared fixtures for the L2 recorder/replay tests.
 *
 * FRAMES reproduces the exact frame shapes captured from the live CLOB market channel
 * on 2026-11-12 (`book` with string levels, batched `price_change` with `side`).
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createL2Recorder } from '../../../src/desk/polymarket/l2/l2-recorder';

export const TOKEN = '94592567375755535402382514854858851873438883868449100686326493803085500123190';
export const OTHER_TOKEN = '49059554369443439132021076202548798831994166731162662055378257349004241428611';
export const CONDITION = '0x835acf3bffe67dcfb5e5f97aba52414739b6f5ff1970195b52d97bb374796155';

const tempDirs: string[] = [];

export async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'l2-test-'));
  tempDirs.push(dir);
  return dir;
}

export async function cleanupTempDirs(): Promise<void> {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

export const FRAMES: string[] = [
  JSON.stringify({
    market: CONDITION,
    asset_id: TOKEN,
    timestamp: '1794488052636',
    hash: 'snap-1',
    event_type: 'book',
    tick_size: '0.01',
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
  }),
  JSON.stringify({
    market: CONDITION,
    timestamp: '1794488052754',
    event_type: 'price_change',
    price_changes: [
      { asset_id: TOKEN, price: '0.40', size: '0', side: 'SELL', hash: 'delta-1' },
      { asset_id: OTHER_TOKEN, price: '0.60', size: '11414.26', side: 'BUY', hash: 'delta-2' },
    ],
  }),
  JSON.stringify({
    market: CONDITION,
    timestamp: '1794488053000',
    event_type: 'price_change',
    price_changes: [{ asset_id: TOKEN, price: '0.395', size: '1200', side: 'BUY', hash: 'delta-3' }],
  }),
  JSON.stringify({
    market: CONDITION,
    asset_id: OTHER_TOKEN,
    timestamp: '1794488053500',
    hash: 'snap-2',
    event_type: 'book',
    bids: [{ price: '0.59', size: '50' }],
    asks: [{ price: '0.61', size: '60' }],
  }),
  JSON.stringify({
    market: CONDITION,
    timestamp: '1794488054000',
    event_type: 'price_change',
    price_changes: [{ asset_id: TOKEN, price: '0.38', size: '0', side: 'BUY', hash: 'delta-4' }],
  }),
];

/** Record FRAMES through the public recorder API and return the JSONL path. */
export async function recordFrames(dir: string): Promise<string> {
  const filePath = join(dir, 'session.jsonl');
  const recorder = createL2Recorder({ filePath });
  for (const frame of FRAMES) await recorder.recordRawMessage(frame);
  await recorder.close();
  return filePath;
}
