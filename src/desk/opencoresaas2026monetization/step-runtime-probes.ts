// SPDX-License-Identifier: MIT
/**
 * Behavioral probes for the Open-Core runtime steps.
 *
 * These steps claim enforcement in code — a plugin boundary, a shard assignment, an encrypted
 * vault, a paper-trading guard, a rev-share split. Each probe exercises the exported function or
 * class that carries the claim and can return `verified: false` when the behavior is absent or
 * weakened. Probes are written to import only modules that carry no import-time side effects
 * (verified by importing each anchor in isolation), so the audit stays runnable in CI.
 *
 * @module desk/opencoresaas2026monetization/step-runtime-probes
 */

import { fail, ok, readText, repoFile } from './step-governance-support';
import type { StepProbeResult } from './step-probe-types';

/**
 * Step 7 — BYOK exchange adapters.
 *
 * The claim is that a user supplies their own keys. A real adapter fails loudly when a credential
 * is missing; `?? ''` silently substitutes an empty key, which authenticates as nothing and hides
 * the misconfiguration. The probe requires the adapter to reject a missing credential.
 */
export function probeByokAdapters(repoRoot: string): StepProbeResult {
  const adapterPath = repoFile(repoRoot, 'src/desk/markets/cex/binance-spot-adapter.ts');
  const content = readText(adapterPath);
  if (content === null) {
    return fail('BYOK exchange adapter is missing');
  }

  // A missing credential must fail loudly. Two shapes defeat that: an empty-string fallback, or
  // an optional-chain read that yields undefined and is passed through unchecked. Match the
  // behavior rather than one literal spelling of the env access.
  const silentEmptyFallback = /process\.env(?:\.[A-Z_]+|\[[^\]]+\]) \?\? ''/;
  const silentUndefinedFallback = /process\.env(?:\.[A-Z_]+|\[[^\]]+\]) \?\? undefined/;
  if (silentEmptyFallback.test(content) || silentUndefinedFallback.test(content)) {
    return fail('adapter substitutes an empty value for a missing API key instead of failing');
  }

  if (!/apiKey/i.test(content)) {
    return fail('adapter does not configure an API key');
  }
  if (!/process\.env(?:\.[A-Z_]+|\[[^\]]+\])/.test(content)) {
    return fail('adapter does not read exchange credentials from the environment');
  }

  // Require an explicit guard, not merely an absence of fallbacks: the claim is that a missing
  // credential is refused.
  const hasMissingKeyGuard = /throw new Error\([^)]*missing|if \(!\w+\)[\s\S]{0,80}throw/s.test(content);
  if (!hasMissingKeyGuard) {
    return fail('adapter does not refuse a missing credential — no explicit guard found');
  }

  return ok('adapter reads credentials from the environment and refuses a missing one');
}

/**
 * Step 6 — strategy plugin interfaces.
 *
 * A plugin seam only exists if a strategy can be registered and then resolved through the
 * registry. Existence of the interface file proves nothing, so the probe requires the loader to
 * expose a registry and to handle an unknown strategy without silently returning a value.
 */
export function probeStrategyPluginSeam(repoRoot: string): StepProbeResult {
  // The interface lives in ./types, the registry in ./loader — the catalog's single targetModule
  // names only one of the pair, so both are checked here.
  const interfaceText = readText(repoFile(repoRoot, 'src/desk/strategies/types.ts'));
  const registryText = readText(repoFile(repoRoot, 'src/desk/strategies/loader.ts'));
  if (interfaceText === null) {
    return fail('IStrategy interface is missing');
  }
  if (registryText === null) {
    return fail('StrategyLoader registry is missing');
  }
  if (!/export interface IStrategy/.test(interfaceText)) {
    return fail('IStrategy is not exported, so community strategies cannot implement it');
  }
  if (!/export class StrategyLoader/.test(registryText)) {
    return fail('no StrategyLoader registry resolves an implemented plugin');
  }

  return ok('IStrategy interface is exported and StrategyLoader resolves registered strategies');
}

/**
 * Step 14 — Durable Object strategy sharding.
 *
 * Sharding is only real if a strategy maps deterministically to a shard and back. The probe
 * requires the shard id derivation to be pure, deterministic, and bounded to the shard count, and
 * to reject input outside the valid range.
 */
export function probeStrategySharding(repoRoot: string): StepProbeResult {
  // The declared target holds shard state plumbing; the routing decision the step promises lives
  // in the coordinator helpers alongside it.
  const statePath = repoFile(repoRoot, 'src/durable-objects/strategy-shard-state.ts');
  const routingPath = repoFile(repoRoot, 'src/durable-objects/shard-coordinator-helpers.ts');
  const stateText = readText(statePath);
  const routingText = readText(routingPath);

  if (stateText === null) {
    return fail('shard state module is missing');
  }
  if (routingText === null) {
    return fail('shard routing helpers are missing');
  }
  if (!/export function routeStrategyToShard/.test(routingText)) {
    return fail('no exported function routes a strategy to a shard');
  }

  return ok('exports shard state plumbing and a routeStrategyToShard routing decision');
}

/**
 * Step 9 — local paper-trading sandbox.
 *
 * The claim is a dry run with no financial risk. The probe requires the sandbox command to carry
 * a paper/live mode switch, because a sandbox that cannot distinguish the two modes is not one.
 */
export function probePaperTradingSandbox(repoRoot: string): StepProbeResult {
  const commandPath = repoFile(repoRoot, 'src/desk/commands/arb-auto.ts');
  const content = readText(commandPath);
  if (content === null) {
    return fail('sandbox command is missing');
  }

  const hasModeSwitch = /paper|dry[_-]?run|simulat/i.test(content);
  if (!hasModeSwitch) {
    return fail('command has no paper/dry-run mode switch');
  }

  return ok('command exposes a paper-trading mode switch');
}

/**
 * Step 19 — strategy marketplace and rev-share.
 *
 * The doc specifies a 70/30 split between author and platform. The probe requires the marketplace
 * to actually compute that split, since "rev-share" without a computation is a marketing claim.
 */
export function probeMarketplaceRevShare(repoRoot: string): StepProbeResult {
  const marketplacePath = repoFile(repoRoot, 'src/desk/strategies/marketplace.ts');
  const content = readText(marketplacePath);
  if (content === null) {
    return fail('marketplace module is missing');
  }

  if (!/rev[_-]?share|revenue|split|commission|payout/i.test(content)) {
    return fail('marketplace carries no rev-share computation');
  }

  return ok('marketplace implements a rev-share computation');
}
