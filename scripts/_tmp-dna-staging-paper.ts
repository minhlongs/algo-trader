/**
 * Staging smoke: DNA engine in paper mode against local Postgres,
 * fed by real Binance REST candles. Verifies that journal rows are produced.
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '5432';
  process.env.DB_NAME = 'algo_trader';
  process.env.DB_USER = 'postgres';
  process.env.DB_PASSWORD = '';

  const {
    startDnaEngine,
    stopDnaEngine,
    getDnaEngine,
    onDnaEvent,
  } = await import(join(__dirname, '..', 'src', 'strategies', 'dna', 'orchestrator.ts'));

  const { createPostgresStateStore } =
    await import(join(__dirname, '..', 'src', 'strategies', 'dna', 'dna-state-store.ts'));

  const { createBinanceCandleProvider } =
    await import(join(__dirname, '..', 'src', 'strategies', 'dna', 'binance-candle-provider.ts'));

  const stateStore = await createPostgresStateStore();
  const provider = createBinanceCandleProvider('BTCUSDT');

  // Use full 6-TF set with a relaxed agreement threshold so consensus can fire quickly.
  const engine = startDnaEngine(
    provider as any,
    {
      paperMode: true,
      tfOrder: ['1m', '5m', '15m', '1h', '4h', '1d'],
      timeframes: {
        '1m':  { intervalMs: 60_000 },
        '5m':  { intervalMs: 300_000 },
        '15m': { intervalMs: 900_000 },
        '1h':  { intervalMs: 3_600_000 },
        '4h':  { intervalMs: 14_400_000 },
        '1d':  { intervalMs: 86_400_000 },
      },
      minTfAgreement: 1,
    },
    stateStore,
  );

  const events: string[] = [];
  const unsub = onDnaEvent((ev) => {
    events.push(ev.type);
    console.log('[event]', ev.type, ev.tf ?? '');
  });

  console.log('[staging] engine started (paperMode=true, provider=binance:BTCUSDT, tfs=all)');

  // Allow several 1m ticks and at least one 5m+ tick to fire consensus.
  await new Promise((r) => setTimeout(r, 20_000));

  const eng = getDnaEngine()!;
  console.log('[staging] engine state', JSON.stringify({
    running: eng.isRunning,
    paperMode: eng.paperMode,
    lastConsensus: !!eng.getLastConsensus(),
    lastTfSignal1m: !!eng.getLastTfSignal('1m'),
  }));
  console.log('[staging] observed events:', events.join(', ') || '(none)');

  unsub();
  await stopDnaEngine();

  // Verify that journal rows were actually written (real data path).
  const { Pool } = await import('pg');
  const pool = new Pool({
    host: 'localhost', port: 5432, database: 'algo_trader', user: 'postgres', password: '',
  });
  const client = await pool.connect();
  try {
    const r = await client.query<{ cnt: string }>(
      'SELECT COUNT(*)::text AS cnt FROM dna_journal',
    );
    const count = parseInt(r.rows[0].cnt, 10);
    console.log('[staging] dna_journal rows:', count);
    if (count > 0) {
      const sample = await client.query(
        `SELECT id, action, confidence, paper_mode, created_at
         FROM dna_journal
         ORDER BY created_at DESC
         LIMIT 3`,
      );
      console.log('[staging] sample rows:', JSON.stringify(sample.rows, null, 2));
    }
    if (count === 0) {
      console.warn('[staging] WARNING: no journal rows — check that provider returned candles for the live window');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('[staging] FAILED:', e); process.exit(1); });
