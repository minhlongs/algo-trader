/**
 * Gnosis CTF & NegRisk Adapter `eth_call` Simulation Preflight.
 *
 * Encodes exact calldata via `ethers` v6 `Interface` for `CtfCollateralAdapter`
 * (`mergePositions`, `splitPosition`, `redeemPositions`) and `NegRiskCtfCollateralAdapter`
 * (`convertPositions(bytes32 _marketId, uint256 _indexSet, uint256 _amount)`),
 * validates `_indexSet` bitmasks against outcome counts and held NO slots, and
 * fails closed on any `eth_call` revert or validation mismatch.
 */

import { ethers } from 'ethers';
import { PUSD_COLLATERAL_ADDRESS } from './clob-v2-venue-constants';
import type { GnosisCtfSettlementRelayer } from './gnosis-ctf-settlement-relayer';
import type { PositionHolding, RedemptionResult } from './gnosis-ctf-settlement-types';

export const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;
export const DEFAULT_CTF_ADAPTER_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
export const DEFAULT_NEGRISK_ADAPTER_ADDRESS = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

export const CTF_ADAPTER_IFACE = new ethers.Interface([
  'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
  'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
]);

export const NEGRISK_ADAPTER_IFACE = new ethers.Interface([
  'function convertPositions(bytes32 _marketId, uint256 _indexSet, uint256 _amount)',
]);

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const REVERT_SELECTORS = ['0x08c379a0', '0x4e487b71'];

export interface EthCallTxRequest { from?: string; to: string; data: string }
export type EthCallTransport = (tx: EthCallTxRequest, blockTag?: string) => Promise<string>;

export interface CtfEthCallPreflightOptions {
  rpcCall?: EthCallTransport;
  dryRun?: boolean;
  fromAddress?: string;
  ctfAdapterAddress?: string;
  negRiskAdapterAddress?: string;
  collateralToken?: string;
}

export interface CtfPreflightResult {
  ok: boolean;
  to: string;
  calldata: string;
  mode: 'rpc-eth-call' | 'dry-run' | 'unconfigured';
  returnData?: string;
  reason?: string;
}

export function toMarketBytes32(idOrHex: string): string {
  return BYTES32_RE.test(idOrHex) ? idOrHex : ethers.id(idOrHex);
}

export function buildIndexSetFromSlots(slots: ReadonlyArray<number>, outcomeCount: number): bigint | null {
  if (!Number.isInteger(outcomeCount) || outcomeCount < 2 || outcomeCount > 255 || slots.length === 0) return null;
  let mask = 0n;
  const seen = new Set<number>();
  for (const slot of slots) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= outcomeCount || seen.has(slot)) return null;
    seen.add(slot);
    mask |= 1n << BigInt(slot);
  }
  return mask;
}

export function validateNegRiskIndexSet(
  indexSet: bigint, outcomeCount: number, heldNoSlots?: ReadonlyArray<number>,
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(outcomeCount) || outcomeCount < 2 || outcomeCount > 255) return { ok: false, reason: 'invalid-outcome-count' };
  if (indexSet <= 0n || indexSet >= (1n << BigInt(outcomeCount))) return { ok: false, reason: 'index-set-out-of-bounds' };
  if (heldNoSlots !== undefined) {
    const expected = buildIndexSetFromSlots(heldNoSlots, outcomeCount);
    if (expected === null || expected !== indexSet) return { ok: false, reason: 'index-set-mismatch-held-slots' };
  }
  return { ok: true };
}

export class CtfEthCallPreflight {
  private readonly rpcCall?: EthCallTransport;
  private readonly dryRun: boolean;
  private readonly fromAddress?: string;
  private readonly ctfAddress: string;
  private readonly negRiskAddress: string;
  private readonly collateralToken: string;

  constructor(options: CtfEthCallPreflightOptions = {}) {
    this.rpcCall = options.rpcCall;
    this.dryRun = options.dryRun === true;
    this.fromAddress = options.fromAddress ? ethers.getAddress(options.fromAddress) : undefined;
    this.ctfAddress = ethers.getAddress(options.ctfAdapterAddress ?? DEFAULT_CTF_ADAPTER_ADDRESS);
    this.negRiskAddress = ethers.getAddress(options.negRiskAdapterAddress ?? DEFAULT_NEGRISK_ADAPTER_ADDRESS);
    this.collateralToken = ethers.getAddress(options.collateralToken ?? PUSD_COLLATERAL_ADDRESS);
  }

  async simulateConvertPositions(params: {
    marketId: string; indexSet: bigint; amountRaw: bigint; outcomeCount: number;
    heldNoSlots?: ReadonlyArray<number>; availableRaw?: bigint;
  }): Promise<CtfPreflightResult> {
    if (!BYTES32_RE.test(params.marketId)) return this.fail(this.negRiskAddress, 'invalid-market-bytes32');
    if (params.amountRaw <= 0n) return this.fail(this.negRiskAddress, 'non-positive-amount');
    if (params.availableRaw !== undefined && params.amountRaw > params.availableRaw) return this.fail(this.negRiskAddress, 'insufficient-held-balance');
    const maskCheck = validateNegRiskIndexSet(params.indexSet, params.outcomeCount, params.heldNoSlots);
    if (!maskCheck.ok) return this.fail(this.negRiskAddress, maskCheck.reason);
    const calldata = NEGRISK_ADAPTER_IFACE.encodeFunctionData('convertPositions', [params.marketId, params.indexSet, params.amountRaw]);
    return this.dispatch(this.negRiskAddress, calldata, NEGRISK_ADAPTER_IFACE, 'convertPositions');
  }

  async simulateMergeOrSplit(params: {
    op: 'mergePositions' | 'splitPosition'; conditionId: string; amountRaw: bigint;
    partition?: ReadonlyArray<bigint>; parentCollectionId?: string; collateralToken?: string;
  }): Promise<CtfPreflightResult> {
    if (!BYTES32_RE.test(params.conditionId)) return this.fail(this.ctfAddress, 'invalid-condition-bytes32');
    if (params.amountRaw <= 0n) return this.fail(this.ctfAddress, 'non-positive-amount');
    const partition = params.partition ? [...params.partition] : [1n, 2n];
    if (partition.length < 2 || partition.some((p) => p <= 0n)) return this.fail(this.ctfAddress, 'invalid-partition');
    const parent = params.parentCollectionId ?? ZERO_BYTES32;
    if (!BYTES32_RE.test(parent)) return this.fail(this.ctfAddress, 'invalid-parent-collection');
    const collateral = params.collateralToken ? ethers.getAddress(params.collateralToken) : this.collateralToken;
    const calldata = CTF_ADAPTER_IFACE.encodeFunctionData(params.op, [collateral, parent, params.conditionId, partition, params.amountRaw]);
    return this.dispatch(this.ctfAddress, calldata, CTF_ADAPTER_IFACE, params.op);
  }

  async simulateMergePositions(params: { conditionId: string; amountRaw: bigint; partition?: ReadonlyArray<bigint> }): Promise<CtfPreflightResult> {
    return this.simulateMergeOrSplit({ op: 'mergePositions', ...params });
  }

  async simulateRedeemPositions(params: {
    conditionId: string; indexSets: ReadonlyArray<bigint>; outcomeCount?: number; collateralToken?: string;
  }): Promise<CtfPreflightResult> {
    if (!BYTES32_RE.test(params.conditionId)) return this.fail(this.ctfAddress, 'invalid-condition-bytes32');
    if (params.indexSets.length === 0) return this.fail(this.ctfAddress, 'empty-index-sets');
    const bound = params.outcomeCount ? 1n << BigInt(params.outcomeCount) : null;
    if (params.indexSets.some((s) => s <= 0n || (bound !== null && s >= bound))) return this.fail(this.ctfAddress, 'index-set-out-of-bounds');
    const collateral = params.collateralToken ? ethers.getAddress(params.collateralToken) : this.collateralToken;
    const calldata = CTF_ADAPTER_IFACE.encodeFunctionData('redeemPositions', [collateral, ZERO_BYTES32, params.conditionId, [...params.indexSets]]);
    return this.dispatch(this.ctfAddress, calldata, CTF_ADAPTER_IFACE, 'redeemPositions');
  }

  private async dispatch(to: string, calldata: string, iface: ethers.Interface, fn: string): Promise<CtfPreflightResult> {
    iface.decodeFunctionData(fn, calldata);
    if (this.rpcCall) {
      try {
        const ret = await this.rpcCall({ ...(this.fromAddress ? { from: this.fromAddress } : {}), to, data: calldata }, 'latest');
        if (typeof ret !== 'string' || !ret.startsWith('0x') || REVERT_SELECTORS.some((s) => ret.toLowerCase().startsWith(s))) {
          return { ok: false, to, calldata, mode: 'rpc-eth-call', returnData: String(ret), reason: 'eth-call-reverted' };
        }
        return { ok: true, to, calldata, mode: 'rpc-eth-call', returnData: ret };
      } catch (err) {
        return { ok: false, to, calldata, mode: 'rpc-eth-call', reason: err instanceof Error ? err.message : String(err) };
      }
    }
    if (this.dryRun) return { ok: true, to, calldata, mode: 'dry-run', returnData: '0x' };
    return { ok: false, to, calldata, mode: 'unconfigured', reason: 'missing-eth-call-transport' };
  }

  private fail(to: string, reason: string): CtfPreflightResult {
    return { ok: false, to, calldata: '0x', mode: this.rpcCall ? 'rpc-eth-call' : this.dryRun ? 'dry-run' : 'unconfigured', reason };
  }
}

export async function executeRedemptionWithPreflight(
  relayer: GnosisCtfSettlementRelayer, preflight: CtfEthCallPreflight, position: PositionHolding,
): Promise<{ preflight: CtfPreflightResult; redemption: RedemptionResult | null }> {
  const report = relayer.getCondition(position.conditionId);
  const pre = await preflight.simulateRedeemPositions({
    conditionId: toMarketBytes32(position.conditionId), indexSets: [BigInt(position.indexSet)], outcomeCount: report?.outcomeSlotCount,
  });
  return { preflight: pre, redemption: pre.ok ? await relayer.executeRedemption(position) : null };
}
