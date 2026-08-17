/**
 * Experiment Config Validation Tests
 *
 * Validates all JSON configs in configs/ against the ExperimentConfig schema
 * and runs each end-to-end with mock candle data.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ExperimentConfig } from '../experiments/experiment-types';
import { runExperiment } from '../experiments/experiment-engine';
import type { CandleLike } from '../regimes/regime-types';
import { listFeatures } from '../features/feature-registry';

const CONFIGS_DIR = join(__dirname, '..', 'configs');

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadConfig(fileName: string): ExperimentConfig {
  const raw = readFileSync(join(CONFIGS_DIR, fileName), 'utf-8');
  return JSON.parse(raw) as ExperimentConfig;
}

function makeMockCandles(symbol: string, count: number): CandleLike[] {
  const base = symbol.includes('BTC') ? 60000 : symbol.includes('ETH') ? 3500 : 150;
  const candles: CandleLike[] = [];
  let price = base;

  for (let i = 0; i < count; i++) {
    const drift = (Math.random() - 0.48) * base * 0.008;
    const open = price;
    const close = open + drift;
    const high = Math.max(open, close) + Math.abs(drift) * 0.3;
    const low = Math.min(open, close) - Math.abs(drift) * 0.3;

    candles.push({
      timestamp: new Date(Date.UTC(2025, 0, 1, i)).toISOString(),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(1000 + Math.random() * 5000),
    });

    price = close;
  }
  return candles;
}

// ── Schema Validation ────────────────────────────────────────────────────────

function validateSchema(config: ExperimentConfig): string[] {
  const errors: string[] = [];
  const requiredString = ['experimentId', 'hypothesis', 'symbol', 'timeframe'] as const;
  for (const field of requiredString) {
    if (typeof config[field] !== 'string' || (config[field] as string).length === 0) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!Array.isArray(config.features) || config.features.length === 0) {
    errors.push('features must be a non-empty array');
  }
  if (typeof config.tp !== 'number' || config.tp <= 0) {
    errors.push('tp must be positive');
  }
  if (typeof config.sl !== 'number' || config.sl <= 0) {
    errors.push('sl must be positive');
  }
  if (typeof config.maxHolding !== 'number' || config.maxHolding < 1) {
    errors.push('maxHolding must be >= 1');
  }
  if (typeof config.lookback !== 'number' || config.lookback < 1) {
    errors.push('lookback must be >= 1');
  }
  if (typeof config.seed !== 'number') {
    errors.push('seed must be a number');
  }
  if (typeof config.gitCommit !== 'string') {
    errors.push('gitCommit must be a string');
  }
  if (typeof config.createdAt !== 'string') {
    errors.push('createdAt must be a string');
  }

  // Split validation
  if (!config.split) {
    errors.push('split is required');
  } else {
    const { trainRatio, valRatio, testRatio, mode } = config.split;
    if (mode !== 'expanding' && mode !== 'rolling') {
      errors.push('split.mode must be expanding or rolling');
    }
    if (trainRatio + valRatio + testRatio > 1) {
      errors.push('split ratios must sum <= 1');
    }
  }

  // Cost validation
  if (!config.cost) {
    errors.push('cost is required');
  } else {
    if (typeof config.cost.feeBps !== 'number' || config.cost.feeBps < 0) {
      errors.push('cost.feeBps must be >= 0');
    }
    if (typeof config.cost.slippageBps !== 'number' || config.cost.slippageBps < 0) {
      errors.push('cost.slippageBps must be >= 0');
    }
  }

  return errors;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Experiment configs', () => {
  const configFiles = readdirSync(CONFIGS_DIR).filter((f) => f.endsWith('.json'));

  it('at least 3 config files exist in configs/', () => {
    expect(configFiles.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of configFiles) {
    describe(file, () => {
      let config: ExperimentConfig;

      it('loads and parses JSON', () => {
        config = loadConfig(file);
        expect(config).toBeDefined();
      });

      it('passes schema validation', () => {
        config = config ?? loadConfig(file);
        const errors = validateSchema(config);
        expect(errors).toEqual([]);
      });

      it('features exist in registry', () => {
        config = config ?? loadConfig(file);
        const registered = listFeatures().map((f) => f.name);
        for (const feat of config.features) {
          expect(registered).toContain(feat);
        }
      });

      it('runs end-to-end with mock candles', () => {
        config = config ?? loadConfig(file);
        const minBars = Math.ceil(
          1 /
            (1 -
              config.split.trainRatio -
              config.split.valRatio -
              config.split.testRatio +
              0.01) *
            100,
        );
        const candles = makeMockCandles(config.symbol, Math.max(500, minBars * 3));
        const result = runExperiment({ candles, config });

        expect(result.config.experimentId).toBe(config.experimentId);
        expect(result.totalBars).toBe(candles.length);
        expect(result.numSteps).toBeGreaterThanOrEqual(1);
        expect(result.metrics.train).toBeDefined();
        expect(result.metrics.val).toBeDefined();
        expect(result.metrics.test).toBeDefined();
        expect(typeof result.metrics.train.numTrades).toBe('number');
        expect(typeof result.metrics.val.numTrades).toBe('number');
        expect(typeof result.metrics.test.numTrades).toBe('number');
      });
    });
  }
});
