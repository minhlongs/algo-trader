// SPDX-License-Identifier: MIT
/**
 * Runtime probes — each must be able to fail.
 *
 * A probe that only ever returns green is the same dishonesty this phase removes, so each probe is
 * checked against a stub whose claim is broken (expect false) as well as against the real
 * repository. The stubs are written to throwaway temp dirs so the repo tree is never mutated.
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  probeByokAdapters,
  probeMarketplaceRevShare,
  probePaperTradingSandbox,
  probeStrategyPluginSeam,
  probeStrategySharding,
} from '../step-runtime-probes';
import {
  probeCliUpgradePrompt,
  probeOssEeBoundary,
  probeSecretPurgeWiring,
} from '../step-boundary-probes';
import { probeKeyVault } from '../step-vault-probe';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const cleanups: string[] = [];

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-rt-probe-'));
  cleanups.push(dir);
  return dir;
}

function write(root: string, rel: string, body: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

afterEach(() => {
  while (cleanups.length > 0) {
    const dir = cleanups.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('key vault (step 15)', () => {
  it('verifies the real AES-256-GCM round trip and tamper rejection', () => {
    const result = probeKeyVault();
    expect(result.verified).toBe(true);
    expect(result.evidence).toMatch(/GCM|round-trip/);
  });
});

describe('strategy plugin seam (step 6)', () => {
  it('verifies the real interface plus registry pair', () => {
    expect(probeStrategyPluginSeam(REPO_ROOT).verified).toBe(true);
  });

  it('fails when IStrategy is not exported', () => {
    const dir = tmpRepo();
    write(dir, 'src/desk/strategies/types.ts', 'interface IStrategy { readonly name: string }\n');
    write(dir, 'src/desk/strategies/loader.ts', 'export class StrategyLoader {}\n');

    expect(probeStrategyPluginSeam(dir).verified).toBe(false);
  });

  it('fails when the registry is absent', () => {
    const dir = tmpRepo();
    write(dir, 'src/desk/strategies/types.ts', 'export interface IStrategy { readonly name: string }\n');

    expect(probeStrategyPluginSeam(dir).verified).toBe(false);
  });
});

describe('shard routing (step 14)', () => {
  it('verifies the real shard plumbing plus routing helper', () => {
    expect(probeStrategySharding(REPO_ROOT).verified).toBe(true);
  });

  it('fails when no routing function is exported', () => {
    const dir = tmpRepo();
    write(dir, 'src/durable-objects/strategy-shard-state.ts', 'export async function persistHealth() {}\n');
    write(dir, 'src/durable-objects/shard-coordinator-helpers.ts', 'export function unused() { return 0 }\n');

    expect(probeStrategySharding(dir).verified).toBe(false);
  });
});

describe('paper-trading sandbox (step 9)', () => {
  it('verifies the real command carries a mode switch', () => {
    expect(probePaperTradingSandbox(REPO_ROOT).verified).toBe(true);
  });

  it('fails a command with no paper/dry-run mode', () => {
    const dir = tmpRepo();
    write(dir, 'src/desk/commands/arb-auto.ts', 'export async function runArbAuto() {}\n');

    expect(probePaperTradingSandbox(dir).verified).toBe(false);
  });
});

describe('marketplace rev-share (step 19)', () => {
  it('verifies the real marketplace computes a split', () => {
    expect(probeMarketplaceRevShare(REPO_ROOT).verified).toBe(true);
  });

  it('fails a marketplace with no rev-share computation', () => {
    const dir = tmpRepo();
    write(dir, 'src/desk/strategies/marketplace.ts', 'export class Marketplace { list() { return [] } }\n');

    expect(probeMarketplaceRevShare(dir).verified).toBe(false);
  });
});

describe('secret purge wiring (step 1)', () => {
  it('reports the real repo as having an unwired ruleset', () => {
    const result = probeSecretPurgeWiring(REPO_ROOT);
    expect(result.verified).toBe(false);
    expect(result.evidence).toMatch(/gitleaks/i);
  });

  it('verifies when a CI workflow runs gitleaks', () => {
    const dir = tmpRepo();
    write(dir, '.gitleaks.toml', 'title = "x"\n[extend]\nuseDefault = true\n');
    write(dir, '.github/workflows/ci.yml', 'jobs:\n  secrets:\n    steps:\n      - run: gitleaks detect\n');

    expect(probeSecretPurgeWiring(dir).verified).toBe(true);
  });
});

describe('OSS vs EE boundary (step 2)', () => {
  it('fails when the expected directories are absent', () => {
    const dir = tmpRepo();
    expect(probeOssEeBoundary(dir).verified).toBe(false);
  });
});

describe('BYOK adapters (step 7)', () => {
  it('reports the real adapter as substituting an empty key', () => {
    const result = probeByokAdapters(REPO_ROOT);
    expect(result.verified).toBe(false);
    expect(result.evidence).toMatch(/empty value/i);
  });

  it('verifies an adapter that fails loudly on a missing key', () => {
    const dir = tmpRepo();
    write(
      dir,
      'src/desk/markets/cex/binance-spot-adapter.ts',
      [
        "function requireEnv(name: string): string {",
        "  const v = process.env[name];",
        "  if (!v) throw new Error(`missing ${name}`);",
        "  return v;",
        "}",
        "export function createBinanceExchange() {",
        "  return { apiKey: requireEnv('BINANCE_API_KEY'), secret: requireEnv('BINANCE_API_SECRET') };",
        "}",
      ].join('\n'),
    );

    expect(probeByokAdapters(dir).verified).toBe(true);
  });
});

describe('CLI upgrade prompt (step 22)', () => {
  it('reports the real CLI as emitting no upgrade prompt', () => {
    const result = probeCliUpgradePrompt(REPO_ROOT);
    expect(result.verified).toBe(false);
  });

  it('verifies a CLI that emits 402 with an upgrade URL', () => {
    const dir = tmpRepo();
    write(dir, 'src/desk/commands/opencore-saas.ts', "logger.info('402 upgrade required');\n");
    write(
      dir,
      'src/desk/opencoresaas2026monetization/billing-meter.ts',
      'upgradeUrl: "https://app.example/billing/recharge",\n',
    );

    expect(probeCliUpgradePrompt(dir).verified).toBe(true);
  });
});
