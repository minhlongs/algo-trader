/**
 * Behavioral probes for the 25-step Open-Core catalog.
 *
 * Existence checks can only show that a file was committed. These probes exercise the runtime
 * behavior each step promises — an HMAC gate that actually rejects, a quota meter that actually
 * returns 402, a dispatcher that actually routes — so a step counts as verified when the behavior
 * fails, not merely when the path exists.
 *
 * Design rule: a probe must be able to return `verified: false`. A probe that cannot fail is not
 * evidence, and steps with no honest anchor are reported as `unverifiable` rather than given a
 * check that always passes.
 *
 * @module desk/opencoresaas2026monetization/step-behavior-probes
 */

import { probeKeyVault } from './step-vault-probe';
import { probeCloudSignalBridge, probeDeskDaemonFailClosed } from './step-execution-probes';
import { probeLicenseGateEnforcement, probeQuotaMetering } from './step-gate-probes';
import {
  probeAuditLedgerImmutability,
  probeFourTierEntitlements,
  probeIpnSignatureVerification,
  probeTenantIsolation,
} from './step-enforcement-probes';
import {
  probeBacktestLeaderboard,
  probeCiEnforcement,
  probeClaGovernance,
  probeEnvTemplate,
  probeLicenseAndSbom,
  probeOpenApiSpec,
  probeQuarantineLock,
  probeQuickstart,
} from './step-governance-probes';
import {
  probeByokAdapters,
  probeMarketplaceRevShare,
  probePaperTradingSandbox,
  probeStrategyPluginSeam,
  probeStrategySharding,
} from './step-runtime-probes';
import {
  probeCliUpgradePrompt,
  probeOssEeBoundary,
  probeSecretPurgeWiring,
} from './step-boundary-probes';
import type { StepProbeResult } from './step-probe-types';

/**
 * Steps with no honest runtime anchor yet.
 *
 * Rather than invent a check that cannot fail, these report `absent` so the audit is forced to
 * label them existence-only. The audit uses this to refuse a READY verdict.
 */
export function probeUnsupported(): StepProbeResult {
  return {
    verified: false,
    evidence: 'no behavioral probe defined for this step; existence-verified only',
    kind: 'absent',
  };
}

/**
 * Behavioral probe registry.
 *
 * Only steps with a real anchor get an entry. Everything else resolves through
 * `probeUnsupported`, which reports `absent` and prevents the step from counting as verified.
 * Adding a probe is therefore an explicit claim that the behavior can be exercised.
 */
const AUDIT_LEDGER_STEP_ID = 'immutable-compliance-audit-log';
const TENANT_RBAC_STEP_ID = 'multi-tenant-rbac-isolation';
const FOUR_TIER_STEP_ID = 'four-tier-entitlements';
const IPN_WEBHOOK_STEP_ID = 'nowpayments-payos-ipn-webhook';
const LICENSE_GATE_STEP_ID = 'hmac-jwt-license-gate';
const MCU_METERING_STEP_ID = 'mcu-and-quota-metering';
const QUARANTINE_LOCK_STEP_ID = 'gitignore-quarantine-lock';
const ENV_TEMPLATE_STEP_ID = 'env-example-byok-template';
const LICENSE_SBOM_STEP_ID = 'mit-license-and-sbom';
const OPENAPI_STEP_ID = 'versioned-openapi-sdk';
const CI_GATE_STEP_ID = 'ci-loc-and-secret-gate';
const LEADERBOARD_STEP_ID = 'public-backtest-leaderboard';
const CLA_STEP_ID = 'cla-and-dual-license-governance';
const QUICKSTART_STEP_ID = 'sixty-second-quickstart-cli';
const KEY_VAULT_STEP_ID = 'encrypted-api-key-vault';
const BYOK_ADAPTERS_STEP_ID = 'byok-exchange-adapters';
const PLUGIN_SEAM_STEP_ID = 'strategy-plugin-interfaces';
const SHARDING_STEP_ID = 'durable-object-sharding';
const SANDBOX_STEP_ID = 'local-paper-trading-sandbox';
const REVSHARE_STEP_ID = 'strategy-marketplace-revshare';
const SECRET_PURGE_STEP_ID = 'git-history-secret-purge';
const OSS_EE_STEP_ID = 'oss-vs-ee-directory-split';
const UPGRADE_PROMPT_STEP_ID = 'cli-http402-upgrade-prompt';
const CLOUD_BRIDGE_STEP_ID = 'cloud-signal-bridge';
const DESK_DAEMON_STEP_ID = 'autonomous-24x7-desk-daemon';

/**
 * Probes are registered with the context they need. Most are pure and ignore `repoRoot`; the
 * governance probes read the repository files whose claims they verify.
 */
const STEP_PROBES: Readonly<Record<string, (repoRoot: string) => StepProbeResult | Promise<StepProbeResult>>> = {
  [LICENSE_GATE_STEP_ID]: () => probeLicenseGateEnforcement(),
  [MCU_METERING_STEP_ID]: () => probeQuotaMetering(),
  [AUDIT_LEDGER_STEP_ID]: () => probeAuditLedgerImmutability(),
  [TENANT_RBAC_STEP_ID]: () => probeTenantIsolation(),
  [FOUR_TIER_STEP_ID]: () => probeFourTierEntitlements(),
  [IPN_WEBHOOK_STEP_ID]: () => probeIpnSignatureVerification(),
  [QUARANTINE_LOCK_STEP_ID]: probeQuarantineLock,
  [ENV_TEMPLATE_STEP_ID]: probeEnvTemplate,
  [LICENSE_SBOM_STEP_ID]: probeLicenseAndSbom,
  [OPENAPI_STEP_ID]: probeOpenApiSpec,
  [CI_GATE_STEP_ID]: probeCiEnforcement,
  [LEADERBOARD_STEP_ID]: probeBacktestLeaderboard,
  [CLA_STEP_ID]: probeClaGovernance,
  [QUICKSTART_STEP_ID]: probeQuickstart,
  [KEY_VAULT_STEP_ID]: () => probeKeyVault(),
  [BYOK_ADAPTERS_STEP_ID]: probeByokAdapters,
  [PLUGIN_SEAM_STEP_ID]: probeStrategyPluginSeam,
  [SHARDING_STEP_ID]: probeStrategySharding,
  [CLOUD_BRIDGE_STEP_ID]: probeCloudSignalBridge,
  [DESK_DAEMON_STEP_ID]: () => probeDeskDaemonFailClosed(),
  [SANDBOX_STEP_ID]: probePaperTradingSandbox,
  [REVSHARE_STEP_ID]: probeMarketplaceRevShare,
  [SECRET_PURGE_STEP_ID]: probeSecretPurgeWiring,
  [OSS_EE_STEP_ID]: probeOssEeBoundary,
  [UPGRADE_PROMPT_STEP_ID]: probeCliUpgradePrompt,
};

/** Run the behavioral probe for a step id, or the unsupported result when none is registered. */
export async function probeStep(stepId: string, repoRoot: string): Promise<StepProbeResult> {
  const probe = STEP_PROBES[stepId];
  return probe ? await probe(repoRoot) : probeUnsupported();
}

/** Ids of steps that have a real behavioral probe. */
export function behaviorallyProbedStepIds(): readonly string[] {
  return Object.keys(STEP_PROBES);
}
