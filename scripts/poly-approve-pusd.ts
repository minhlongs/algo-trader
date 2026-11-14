/**
 * Standalone CLI for out-of-process `pUSD` & `PositionManager` bounded approvals.
 *
 * Defaults to `--dry-run`: prints exact EIP-155 (chainId 137) ERC-20 `approve`
 * and ERC-1155 `setApprovalForAll` calldata without touching the network or
 * requiring a private key unless `--broadcast` is explicitly passed.
 */

import { basename } from 'node:path';
import {
  runPusdBoundedApproval,
  type PusdBoundedApprovalPlan,
} from '../src/desk/polymarket/pusd-bounded-approval-runner';

export interface PolyApproveCliFlags {
  broadcast: boolean;
  dryRun: boolean;
  amountPusd: number;
  exchangeV3Address: string;
  negRiskAdapterAddress?: string;
  positionManagerAddress?: string;
  rpcUrl?: string;
  json: boolean;
}

const DEFAULT_PILOT_APPROVAL_PUSD = 5_000;
const DRY_RUN_PLACEHOLDER_EXCHANGE_V3 = '0xC5d563A36AE78145C45a50134d48A1215220f80a';

function readFlagValue(argv: readonly string[], idx: number, flag: string): { value: string; nextIdx: number } {
  const eqPos = argv[idx]!.indexOf('=');
  if (eqPos !== -1) {
    const val = argv[idx]!.slice(eqPos + 1).trim();
    if (!val) throw new Error(`Missing value for ${flag}`);
    return { value: val, nextIdx: idx };
  }
  const next = argv[idx + 1];
  if (!next || next.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return { value: next, nextIdx: idx + 1 };
}

export function parsePolyApproveCliFlags(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): PolyApproveCliFlags {
  let broadcast = false;
  let json = false;
  let amountPusd = Number(env['POLY_APPROVAL_AMOUNT_PUSD'] ?? DEFAULT_PILOT_APPROVAL_PUSD);
  let explicitExchange = env['POLY_EXCHANGE_V3_ADDRESS']?.trim() || undefined;
  let negRiskAdapterAddress = env['POLY_NEGRISK_ADAPTER_ADDRESS'];
  let positionManagerAddress = env['POLY_POSITION_MANAGER_ADDRESS'];
  let rpcUrl = env['POLYGON_RPC_URL'];

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]!;
    const flag = raw.split('=')[0]!;
    if (raw === '--broadcast') {
      broadcast = true;
    } else if (raw === '--dry-run') {
      broadcast = false;
    } else if (raw === '--json') {
      json = true;
    } else if (flag === '--amount-pusd') {
      const r = readFlagValue(argv, i, flag);
      amountPusd = Number(r.value);
      i = r.nextIdx;
    } else if (flag === '--exchange') {
      const r = readFlagValue(argv, i, flag);
      explicitExchange = r.value;
      i = r.nextIdx;
    } else if (flag === '--neg-risk-adapter') {
      const r = readFlagValue(argv, i, flag);
      negRiskAdapterAddress = r.value;
      i = r.nextIdx;
    } else if (flag === '--position-manager') {
      const r = readFlagValue(argv, i, flag);
      positionManagerAddress = r.value;
      i = r.nextIdx;
    } else if (flag === '--rpc-url') {
      const r = readFlagValue(argv, i, flag);
      rpcUrl = r.value;
      i = r.nextIdx;
    } else {
      throw new Error(`Unknown or unsupported CLI argument: "${raw}"`);
    }
  }

  if (broadcast && !explicitExchange) {
    throw new Error('Broadcast mode requires explicit --exchange or POLY_EXCHANGE_V3_ADDRESS (refusing placeholder)');
  }

  return {
    broadcast,
    dryRun: !broadcast,
    amountPusd,
    exchangeV3Address: explicitExchange ?? DRY_RUN_PLACEHOLDER_EXCHANGE_V3,
    ...(negRiskAdapterAddress ? { negRiskAdapterAddress } : {}),
    ...(positionManagerAddress ? { positionManagerAddress } : {}),
    ...(rpcUrl ? { rpcUrl } : {}),
    json,
  };
}

export function formatApprovalPlanText(plan: PusdBoundedApprovalPlan): string {
  const lines = [
    `[poly-approve-pusd] mode=${plan.mode} chainId=${plan.chainId} pUSD=${plan.collateralToken}`,
    `[poly-approve-pusd] boundedAmount=${plan.boundedAmountPusd} pUSD (${plan.boundedAmountRaw} raw 6-dec units)`,
  ];
  for (const tx of plan.transactions) {
    lines.push(
      `  #${tx.step} ${tx.description}\n     to=${tx.to} chainId=${tx.chainId} value=${tx.value} data=${tx.data}`,
    );
  }
  for (const r of plan.broadcastReceipts) {
    lines.push(`  receipt #${r.step}: txHash=${r.txHash}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runPolyApproveCli(
  argv: readonly string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
): Promise<PusdBoundedApprovalPlan> {
  const flags = parsePolyApproveCliFlags(argv, env);
  return runPusdBoundedApproval({
    amountPusd: flags.amountPusd,
    exchangeV3Address: flags.exchangeV3Address,
    negRiskAdapterAddress: flags.negRiskAdapterAddress,
    positionManagerAddress: flags.positionManagerAddress,
    broadcast: flags.broadcast,
    rpcUrl: flags.rpcUrl,
    ownerPrivateKey: flags.broadcast ? env['POLY_OWNER_MASTER_PRIVATE_KEY'] : undefined,
  });
}

const invokedScript = process.argv[1] ? basename(process.argv[1]) : '';
if (invokedScript.startsWith('poly-approve-pusd')) {
  runPolyApproveCli()
    .then((plan) => {
      const jsonMode = process.argv.includes('--json');
      process.stdout.write(jsonMode ? `${JSON.stringify(plan, null, 2)}\n` : formatApprovalPlanText(plan));
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[poly-approve-pusd] ERROR: ${message}\n`);
      process.exitCode = 1;
    });
}
