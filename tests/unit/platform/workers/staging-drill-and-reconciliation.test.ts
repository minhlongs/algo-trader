import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import {
  runStagingDrill,
  reconcileFullDatabaseData,
  executePaperTradeCandidate,
} from '../../../../scripts/drills/local-staging-drill';
import { isKillSwitchActive } from '../../../../src/desk/wiring/qwen-drawdown-monitor';

const TEST_DIR = resolve(__dirname, '../../../../.tmp-test-staging-drill');

describe('Local Staging Drill, Reconciliation & Kill Switch Unit Tests', () => {
  const db1 = resolve(TEST_DIR, 'test-db1.db');
  const db2 = resolve(TEST_DIR, 'test-db2.db');

  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
    for (const f of [db1, db2]) {
      if (existsSync(f)) unlinkSync(f);
    }
  });

  afterEach(() => {
    delete process.env.QWEN_KILL;
    for (const f of [db1, db2]) {
      if (existsSync(f)) {
        try { unlinkSync(f); } catch {}
      }
    }
  });

  it('negative test: detects row differences even when count and sum are identical', () => {
    const d1Dir = resolve(__dirname, '../../../../migrations/d1');
    const baseSql = ['0001-subscriptions.sql', '0003-paper-trades-v3.sql']
      .map(f => readFileSync(resolve(d1Dir, f), 'utf8'))
      .join('\n');

    execSync(`sqlite3 "${db1}"`, { input: baseSql });
    execSync(`sqlite3 "${db2}"`, { input: baseSql });

    // Seed db1 and db2 with SAME COUNT (2 rows) and SAME SUM (size_usd sum = 200, pnl sum = 10)
    // BUT differing values/keys!
    // db1: row 1 (size 100, pnl 5), row 2 (size 100, pnl 5)
    // db2: row 1 (size 50, pnl 0), row 2 (size 150, pnl 10)
    const sql1 = `
      INSERT INTO subscriptions (id, user_id, tier, status, amount_cents, currency, created_at, updated_at)
      VALUES ('sub_1', 'u1', 'PRO', 'active', 100, 'usd', '2026-10-31', '2026-10-31');
      INSERT INTO paper_trades_v3 (id, market_id, side, size_usd, entry_price, status, strategy, pnl, source, created_at)
      VALUES ('pt_1', 'm1', 'YES', 100.0, 0.5, 'closed', 's', 5.0, 'qwen', 1000),
             ('pt_2', 'm2', 'YES', 100.0, 0.5, 'closed', 's', 5.0, 'qwen', 2000);
    `;
    const sql2 = `
      INSERT INTO subscriptions (id, user_id, tier, status, amount_cents, currency, created_at, updated_at)
      VALUES ('sub_1', 'u1', 'PRO', 'active', 100, 'usd', '2026-10-31', '2026-10-31');
      INSERT INTO paper_trades_v3 (id, market_id, side, size_usd, entry_price, status, strategy, pnl, source, created_at)
      VALUES ('pt_1', 'm1', 'YES', 50.0, 0.5, 'closed', 's', 0.0, 'qwen', 1000),
             ('pt_2', 'm2', 'YES', 150.0, 0.5, 'closed', 's', 10.0, 'qwen', 2000);
    `;

    execSync(`sqlite3 "${db1}"`, { input: sql1 });
    execSync(`sqlite3 "${db2}"`, { input: sql2 });

    // Verify naive count/sum matches
    const sum1 = execSync(`sqlite3 "${db1}" "SELECT count(*), sum(size_usd), sum(pnl) FROM paper_trades_v3;"`, { encoding: 'utf8' }).trim();
    const sum2 = execSync(`sqlite3 "${db2}" "SELECT count(*), sum(size_usd), sum(pnl) FROM paper_trades_v3;"`, { encoding: 'utf8' }).trim();
    expect(sum1).toBe(sum2); // Naive auditor would claim 100% MATCH!

    // Normalized reconciliation MUST fail
    const recon = reconcileFullDatabaseData(db1, db2);
    expect(recon.match).toBe(false);
    expect(recon.details).toContain('PaperTrades symmetric delta: [2, 2]');
  });

  it('negative test: detects subscription data differences even when count is identical', () => {
    const d1Dir = resolve(__dirname, '../../../../migrations/d1');
    const baseSql = ['0001-subscriptions.sql', '0003-paper-trades-v3.sql']
      .map(f => readFileSync(resolve(d1Dir, f), 'utf8'))
      .join('\n');

    execSync(`sqlite3 "${db1}"`, { input: baseSql });
    execSync(`sqlite3 "${db2}"`, { input: baseSql });

    const sql1 = `INSERT INTO subscriptions (id, user_id, tier, status, amount_cents, currency, created_at, updated_at) VALUES ('s1', 'u1', 'PRO', 'active', 2900, 'usd', '2026-10-31', '2026-10-31');`;
    const sql2 = `INSERT INTO subscriptions (id, user_id, tier, status, amount_cents, currency, created_at, updated_at) VALUES ('s1', 'u1', 'FREE', 'active', 2900, 'usd', '2026-10-31', '2026-10-31');`;

    execSync(`sqlite3 "${db1}"`, { input: sql1 });
    execSync(`sqlite3 "${db2}"`, { input: sql2 });

    const recon = reconcileFullDatabaseData(db1, db2);
    expect(recon.match).toBe(false);
    expect(recon.details).toContain('Subscriptions symmetric delta: [1, 1]');
  });

  it('proves kill switch blocks execution in-flight before mutation and recovers cleanly', async () => {
    const d1Dir = resolve(__dirname, '../../../../migrations/d1');
    const baseSql = readFileSync(resolve(d1Dir, '0003-paper-trades-v3.sql'), 'utf8');
    execSync(`sqlite3 "${db1}"`, { input: baseSql });

    // Baseline: unblocked
    const baseline = await executePaperTradeCandidate(db1, {
      id: 'pt_test_1',
      marketId: 'm1',
      side: 'YES',
      sizeUsd: 100,
      price: 0.5,
      strategy: 'qwen_momentum_alpha',
      source: 'qwen',
    });
    expect(baseline.executed).toBe(true);

    const count1 = execSync(`sqlite3 "${db1}" "SELECT count(*) FROM paper_trades_v3;"`, { encoding: 'utf8' }).trim();
    expect(count1).toBe('1');

    // In-flight barrier trips kill switch
    let barrierFired = false;
    const blocked = await executePaperTradeCandidate(db1, {
      id: 'pt_test_2',
      marketId: 'm2',
      side: 'NO',
      sizeUsd: 200,
      price: 0.4,
      strategy: 'qwen_momentum_alpha',
      source: 'qwen',
      stepSyncBarrier: () => {
        barrierFired = true;
        process.env.QWEN_KILL = '1';
      },
    });

    expect(barrierFired).toBe(true);
    expect(blocked.executed).toBe(false);
    expect(blocked.reason).toBe('KILL_SWITCH_ACTIVE');

    // Confirm 0 mutations occurred under kill switch
    const count2 = execSync(`sqlite3 "${db1}" "SELECT count(*) FROM paper_trades_v3;"`, { encoding: 'utf8' }).trim();
    expect(count2).toBe('1');

    // Deactivate kill switch and recover
    delete process.env.QWEN_KILL;
    const recovered = await executePaperTradeCandidate(db1, {
      id: 'pt_test_3',
      marketId: 'm3',
      side: 'YES',
      sizeUsd: 300,
      price: 0.6,
      strategy: 'qwen_momentum_alpha',
      source: 'qwen',
    });
    expect(recovered.executed).toBe(true);
    const count3 = execSync(`sqlite3 "${db1}" "SELECT count(*) FROM paper_trades_v3;"`, { encoding: 'utf8' }).trim();
    expect(count3).toBe('2');
  });

  it('runs complete local staging drill with real monotonic benchmarks meeting all thresholds', async () => {
    const drillResult = await runStagingDrill();
    expect(drillResult.success).toBe(true);
    expect(drillResult.reconciliation.match).toBe(true);

    // Verify all metrics passed and actual durations are non-zero and within target thresholds
    for (const m of drillResult.metrics) {
      expect(m.status).toBe('PASS');
      expect(m.actualMs).toBeGreaterThan(0);
      expect(m.actualMs).toBeLessThanOrEqual(m.targetMs);
    }
  });
});
