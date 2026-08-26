/**
 * Alpha CLI — Shared helpers for command handlers.
 */
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../shared/utils/logger';
import type { ExperimentConfig } from '../../alpha-lab/experiments/experiment-types';
import type { CandleLike } from '../../alpha-lab/regimes/regime-types';
import { loadCandles } from '../../alpha-lab/experiments/alpha-backtest-adapter';
import type { DataSourceProvenance } from '../../alpha-lab/provenance/run-card';

const CONFIGS_DIR = path.resolve(__dirname, '../../alpha-lab/configs');

export function loadAllConfigs(): ExperimentConfig[] {
  if (!fs.existsSync(CONFIGS_DIR)) return [];
  const files = fs.readdirSync(CONFIGS_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(CONFIGS_DIR, f), 'utf-8');
    return JSON.parse(raw) as ExperimentConfig;
  });
}

export function loadConfigByName(name: string): ExperimentConfig {
  const configs = loadAllConfigs();
  const match = configs.find(
    (c) =>
      c.experimentId === name ||
      c.experimentId.replace(/\.json$/, '') === name,
  );
  if (!match) {
    const available = configs.map((c) => c.experimentId).join(', ');
    throw new Error(
      `Unknown experiment "${name}". Available: ${available || '(none)'}`,
    );
  }
  return match;
}

export async function loadCandlesForConfig(
  config: ExperimentConfig,
): Promise<{ candles: CandleLike[]; source: 'real' | 'mock'; dataSources: DataSourceProvenance[] }> {
  const minBars = Math.ceil(
    1 / (1 - config.split.trainRatio - config.split.valRatio - config.split.testRatio + 0.01) * 100,
  );
  const candleCount = Math.max(500, minBars * 3);
  const { candles, source } = await loadCandles(config.symbol, config.timeframe, candleCount);

  // Construct data source provenance
  const now = new Date().toISOString();
  const start = candles.length > 0 ? candles[0].timestamp : now;
  const end = candles.length > 0 ? candles[candles.length - 1].timestamp : now;

  const dataSources: DataSourceProvenance[] = [
    {
      provider: source === 'real' ? 'ohlcv-store' : 'mock',
      symbol: config.symbol,
      timeframe: config.timeframe,
      start,
      end,
      retrievedAt: now,
      candleCount: candles.length,
    },
  ];

  return { candles, source, dataSources };
}

export function writeOutput(
  data: unknown,
  outputFlag?: string,
  jsonFlag?: boolean,
): void {
  if (jsonFlag) {
    logger.info(JSON.stringify(data, null, 2));
  }
  if (outputFlag) {
    const dir = path.dirname(outputFlag);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputFlag, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`Wrote results to ${outputFlag}`);
  }
}

export function printTable(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const sep = colWidths.map((w) => '─'.repeat(w + 2)).join('┤');
  const headerRow = headers
    .map((h, i) => ` ${h.padEnd(colWidths[i]!)}`)
    .join(' │');
  logger.info(`┌${'─'.repeat(sep.length)}┐`);
  logger.info(`│${headerRow} │`);
  logger.info(`├${sep}┤`);
  for (const row of rows) {
    const cells = row
      .map((c, i) => ` ${(c ?? '').padEnd(colWidths[i]!)}`)
      .join(' │');
    logger.info(`│${cells} │`);
  }
  logger.info(`└${'─'.repeat(sep.length)}┘`);
}
