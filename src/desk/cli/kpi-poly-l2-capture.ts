/**
 * Point-in-time L2 capture & replay helper for `kpi:poly`.
 *
 * Connects to `wss://ws-subscriptions-clob.polymarket.com/ws/market`, subscribes
 * to active token IDs, streams raw book/price_change frames through
 * `createL2Recorder` into `data/polymarket-l2/*.jsonl`, closes cleanly on
 * timer expiry, and replays every JSONL file in `l2Dir` via `replayL2Log`.
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createL2Recorder } from '../polymarket/l2/l2-recorder';
import { replayL2Log, type ReplayedBookStep } from '../polymarket/l2/l2-replay';
import { WS_URL } from '../polymarket/orderbook-stream-types';
import { logger } from '../../shared/utils/logger';

export interface CaptureOrLoadL2Options {
  l2Dir: string;
  assetIds: readonly string[];
  /** Milliseconds to capture live WS frames when > 0. */
  captureDurationMs: number;
  wsUrl?: string;
}

export async function captureLiveL2Window(options: CaptureOrLoadL2Options): Promise<number> {
  const { l2Dir, assetIds, captureDurationMs, wsUrl = WS_URL } = options;
  if (captureDurationMs <= 0 || assetIds.length === 0) return 0;

  mkdirSync(l2Dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = join(l2Dir, `clob-l2-${stamp}.jsonl`);
  const recorder = createL2Recorder({ filePath });
  const pendingWrites: Array<Promise<number>> = [];

  await new Promise<void>((resolve) => {
    let settled = false;
    const ws = new WebSocket(wsUrl);

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.removeAllListeners();
        ws.on('error', () => {
          // Swallow late handshake abort errors after timer expiry.
        });
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch {
        // Ignore teardown race on closing socket
      }
      resolve();
    };

    const timer = setTimeout(finish, captureDurationMs);

    ws.on('open', () => {
      const uniqueIds = [...new Set(assetIds.filter((id) => id.length > 0))];
      ws.send(JSON.stringify({ assets_ids: uniqueIds, type: 'market' }));
    });

    ws.on('message', (data: WebSocket.RawData) => {
      const text = data.toString();
      pendingWrites.push(recorder.recordRawMessage(text));
    });

    ws.on('error', (err: Error) => {
      logger.warn('CLOB L2 capture WebSocket warning', 'kpi-poly-l2-capture', {
        err: err.message,
      });
      finish();
    });

    ws.on('close', finish);
  });

  await Promise.allSettled(pendingWrites);
  await recorder.close();
  return recorder.rowCount;
}

export async function loadAllReplayedL2Steps(l2Dir: string): Promise<ReplayedBookStep[]> {
  if (!existsSync(l2Dir)) return [];
  const files = readdirSync(l2Dir)
    .filter((name) => name.endsWith('.jsonl'))
    .sort()
    .map((name) => join(l2Dir, name));

  const allSteps: ReplayedBookStep[] = [];
  for (const file of files) {
    const steps = await replayL2Log(file);
    allSteps.push(...steps);
  }
  allSteps.sort((a, b) => a.t - b.t);
  return allSteps;
}

export async function captureOrLoadL2Steps(
  options: CaptureOrLoadL2Options,
): Promise<ReplayedBookStep[]> {
  if (options.captureDurationMs > 0 && options.assetIds.length > 0) {
    await captureLiveL2Window(options);
  }
  return loadAllReplayedL2Steps(options.l2Dir);
}
