/**
 * Standalone Out-of-Process `pUSD` & `PositionManager` Bounded Approval Initializer.
 *
 * Generates exact EIP-155 (chainId 137) ERC-20 `approve(spender, boundedAmount)`
 * calldata on `pUSD` (`0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`) and ERC-1155
 * `setApprovalForAll(operator, true)` calldata on `PositionManager` / CTF, avoiding
 * the `nautilus_trader` Relayer HTTP 400 bounded-approval bug inside the trading runtime.
 *
 * Defaults to `dryRun: true` (zero network I/O, zero private key required).
 */

import { ethers } from 'ethers';
import {
  POLYGON_CHAIN_ID,
  PUSD_COLLATERAL_ADDRESS,
  V1_CTF_EXCHANGE_ADDRESS,
} from './clob-v2-venue-constants';
import {
  DEFAULT_CTF_ADAPTER_ADDRESS,
  DEFAULT_NEGRISK_ADAPTER_ADDRESS,
} from './ctf-eth-call-preflight';

export const PUSD_DECIMALS = 6;
export const MAX_SAFE_BOUNDED_APPROVAL_PUSD = 1_000_000;

export const ERC20_APPROVAL_IFACE = new ethers.Interface([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

export const ERC1155_APPROVAL_IFACE = new ethers.Interface([
  'function setApprovalForAll(address operator, bool approved)',
]);

export interface BoundedApprovalTxEnvelope {
  step: number;
  description: string;
  chainId: typeof POLYGON_CHAIN_ID;
  to: string;
  value: '0x0';
  data: string;
  method: 'approve' | 'setApprovalForAll';
  spenderOrOperator: string;
  boundedAmountRaw?: string;
}

export interface PusdBoundedApprovalOptions {
  /** Bounded pUSD allowance in human units (e.g. 5000 = 5,000.000000 pUSD). Never unlimited. */
  amountPusd: number;
  /** ExchangeV3 contract address to approve. */
  exchangeV3Address: string;
  /** Optional NegRisk adapter address to approve alongside ExchangeV3. */
  negRiskAdapterAddress?: string;
  /** PositionManager / ConditionalTokens ERC-1155 contract address. */
  positionManagerAddress?: string;
  /** Defaults to false (`--dry-run` mode). Set true ONLY when `--broadcast` is passed. */
  broadcast?: boolean;
  /** Required ONLY when `broadcast === true`. */
  rpcUrl?: string;
  /** Required ONLY when `broadcast === true` (out-of-process CLI only). */
  ownerPrivateKey?: string;
  /** Optional injected broadcaster for deterministic testing of `--broadcast` mode. */
  broadcastTx?: (tx: BoundedApprovalTxEnvelope) => Promise<{ txHash: string }>;
}

export interface PusdBoundedApprovalPlan {
  mode: 'dry-run' | 'broadcast';
  chainId: typeof POLYGON_CHAIN_ID;
  collateralToken: typeof PUSD_COLLATERAL_ADDRESS;
  positionManager: string;
  boundedAmountPusd: number;
  boundedAmountRaw: string;
  transactions: BoundedApprovalTxEnvelope[];
  broadcastReceipts: Array<{ step: number; txHash: string }>;
}

export function buildPusdBoundedApprovalPlan(
  options: Omit<PusdBoundedApprovalOptions, 'broadcast' | 'rpcUrl' | 'ownerPrivateKey' | 'broadcastTx'>,
): Omit<PusdBoundedApprovalPlan, 'mode' | 'broadcastReceipts'> {
  if (
    !Number.isFinite(options.amountPusd) ||
    options.amountPusd <= 0 ||
    options.amountPusd > MAX_SAFE_BOUNDED_APPROVAL_PUSD
  ) {
    throw new Error(
      `Invalid bounded pUSD approval amount: must be in (0, ${MAX_SAFE_BOUNDED_APPROVAL_PUSD}] (unlimited approvals forbidden)`,
    );
  }

  const exchangeV3 = ethers.getAddress(options.exchangeV3Address);
  if (exchangeV3.toLowerCase() === V1_CTF_EXCHANGE_ADDRESS.toLowerCase()) {
    throw new Error('ExchangeV3 address required; retired V1 CTF Exchange address rejected');
  }
  const negRisk = ethers.getAddress(options.negRiskAdapterAddress ?? DEFAULT_NEGRISK_ADAPTER_ADDRESS);
  const positionManager = ethers.getAddress(options.positionManagerAddress ?? DEFAULT_CTF_ADAPTER_ADDRESS);
  const pusd = ethers.getAddress(PUSD_COLLATERAL_ADDRESS) as typeof PUSD_COLLATERAL_ADDRESS;

  const rawUnits = ethers.parseUnits(options.amountPusd.toFixed(PUSD_DECIMALS), PUSD_DECIMALS);
  if (rawUnits <= 0n || rawUnits >= ethers.MaxUint256) {
    throw new Error('Bounded approval raw units out of valid finite bounds');
  }
  const rawStr = rawUnits.toString();

  const operators = exchangeV3.toLowerCase() === negRisk.toLowerCase()
    ? [exchangeV3]
    : [exchangeV3, negRisk];

  const transactions: BoundedApprovalTxEnvelope[] = [];
  for (const spender of operators) {
    transactions.push({
      step: transactions.length + 1,
      description: `ERC-20 pUSD bounded approve(${spender}, ${rawStr})`,
      chainId: POLYGON_CHAIN_ID,
      to: pusd,
      value: '0x0',
      data: ERC20_APPROVAL_IFACE.encodeFunctionData('approve', [spender, rawUnits]),
      method: 'approve',
      spenderOrOperator: spender,
      boundedAmountRaw: rawStr,
    });
  }
  for (const operator of operators) {
    transactions.push({
      step: transactions.length + 1,
      description: `ERC-1155 PositionManager setApprovalForAll(${operator}, true)`,
      chainId: POLYGON_CHAIN_ID,
      to: positionManager,
      value: '0x0',
      data: ERC1155_APPROVAL_IFACE.encodeFunctionData('setApprovalForAll', [operator, true]),
      method: 'setApprovalForAll',
      spenderOrOperator: operator,
    });
  }

  return {
    chainId: POLYGON_CHAIN_ID,
    collateralToken: PUSD_COLLATERAL_ADDRESS,
    positionManager,
    boundedAmountPusd: options.amountPusd,
    boundedAmountRaw: rawStr,
    transactions,
  };
}

export async function runPusdBoundedApproval(
  options: PusdBoundedApprovalOptions,
): Promise<PusdBoundedApprovalPlan> {
  const base = buildPusdBoundedApprovalPlan(options);
  const broadcast = options.broadcast === true;
  if (!broadcast) {
    return { mode: 'dry-run', ...base, broadcastReceipts: [] };
  }

  let sendTx = options.broadcastTx;
  if (!sendTx) {
    if (!options.rpcUrl || !options.ownerPrivateKey) {
      throw new Error('Broadcast mode requires explicit rpcUrl and ownerPrivateKey');
    }
    const provider = new ethers.JsonRpcProvider(options.rpcUrl, POLYGON_CHAIN_ID);
    const wallet = new ethers.Wallet(options.ownerPrivateKey, provider);
    sendTx = async (env) => {
      const txResp = await wallet.sendTransaction({
        to: env.to, data: env.data, value: 0n, chainId: env.chainId,
      });
      await txResp.wait(1);
      return { txHash: txResp.hash };
    };
  }

  const broadcastReceipts: Array<{ step: number; txHash: string }> = [];
  for (const tx of base.transactions) {
    const receipt = await sendTx(tx);
    broadcastReceipts.push({ step: tx.step, txHash: receipt.txHash });
  }
  return { mode: 'broadcast', ...base, broadcastReceipts };
}
