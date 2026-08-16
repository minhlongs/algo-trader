import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const SCRIPT = join(process.cwd(), 'scripts', 'alpha-validation-loop.ts');

function setupDirs(): { tmp: string; queue: string; output: string; data: string } {
  const tmp = join('/tmp', `alpha-loop-test-${Date.now()}`);
  const queue = join(tmp, 'queue');
  const output = join(tmp, 'output');
  const data = join(tmp, 'data');
  for (const d of [queue, output, data]) mkdirSync(d, { recursive: true });
  return { tmp, queue, output, data };
}

function makeCandlesFile(dir: string, name = 'candles.json'): string {
  const candles = Array.from({ length: 80 }, (_, i) => ({
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 50 + i,
  }));
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(candles));
  return name;
}

function makeQueueItem(id = 'test-001'): Record<string, unknown> {
  return {
    experimentId: id,
    hypothesis: 'test hypothesis',
    symbol: 'X',
    timeframe: '1h',
    features: ['simple_return'],
    regimes: 'all',
    tp: 0.02,
    sl: 0.01,
    maxHolding: 6,
    lookback: 5,
    split: { mode: 'rolling', trainRatio: 0.5, valRatio: 0.25, testRatio: 0.25 },
    cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
    seed: 42,
    gitCommit: 'abc123',
    createdAt: '2025-01-01T00:00:00Z',
    dataFile: 'candles.json',
  };
}

describe('Alpha Validation Loop', () => {
  it('processes a single experiment and writes result', () => {
    const { tmp, queue, output, data } = setupDirs();
    makeCandlesFile(data);
    writeFileSync(join(queue, 'exp1.json'), JSON.stringify(makeQueueItem()));
    const out = execSync(`npx tsx ${SCRIPT} ${queue} ${output} ${data}`, { encoding: 'utf-8' });
    expect(existsSync(join(output, 'test-001.json'))).toBe(true);
    const result = JSON.parse(readFileSync(join(output, 'test-001.json'), 'utf-8'));
    expect(result.experimentId).toBe('test-001');
    expect(result).toHaveProperty('gatePassed');
    expect(result).toHaveProperty('state');
    expect(result).toHaveProperty('experiment');
    rmSync(tmp, { recursive: true, force: true });
  });

  it('exits 0 on empty queue', () => {
    const { tmp, queue, output, data } = setupDirs();
    const out = execSync(`npx tsx ${SCRIPT} ${queue} ${output} ${data}`, { encoding: 'utf-8' });
    expect(out).toContain('No experiment configs');
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns REJECTED for missing data file', () => {
    const { tmp, queue, output, data } = setupDirs();
    const item = makeQueueItem('missing-data');
    item.dataFile = 'nonexistent.json';
    writeFileSync(join(queue, 'missing-data.json'), JSON.stringify(item));
    const out = execSync(`npx tsx ${SCRIPT} ${queue} ${output} ${data}`, { encoding: 'utf-8' });
    expect(out).toContain('FAILED');
    rmSync(tmp, { recursive: true, force: true });
  });
});