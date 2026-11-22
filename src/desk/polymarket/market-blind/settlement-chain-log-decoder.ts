import { Interface } from 'ethers';
import { CONDITION_RESOLUTION_TOPIC0 } from './settlement-verification-contract';

const CTF_CONDITION_RESOLUTION_ABI = [
  'event ConditionResolution(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256 outcomeSlotCount, uint256[] payoutNumerators)',
];
const ctfInterface = new Interface(CTF_CONDITION_RESOLUTION_ABI);

export interface ChainReceiptLog {
  readonly address: string;
  readonly logIndex: number;
  readonly topics: readonly string[];
  readonly data: string;
}

export interface DecodedConditionResolutionLog {
  readonly conditionId: string;
  readonly oracleAddress: string;
  readonly ctfQuestionId: string;
  readonly payoutNumerators: readonly [number, number];
}

export type ConditionResolutionDecodeResult =
  | { readonly ok: true; readonly decoded: DecodedConditionResolutionLog }
  | { readonly ok: false; readonly reason: string };

export function decodeConditionResolutionLog(log: ChainReceiptLog): ConditionResolutionDecodeResult {
  if (!log.topics.length || log.topics[0]!.toLowerCase() !== CONDITION_RESOLUTION_TOPIC0) {
    return { ok: false, reason: 'WRONG_EVENT_SIGNATURE' };
  }
  try {
    const parsed = ctfInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed || parsed.name !== 'ConditionResolution') {
      return { ok: false, reason: 'UNABLE_TO_DECODE_CONDITION_RESOLUTION' };
    }
    const conditionId = String(parsed.args.conditionId).toLowerCase();
    const oracleAddress = String(parsed.args.oracle).toLowerCase();
    const ctfQuestionId = String(parsed.args.questionId).toLowerCase();
    const slotCount = Number(parsed.args.outcomeSlotCount);
    const rawPayouts = parsed.args.payoutNumerators as readonly bigint[];
    if (slotCount !== 2 || rawPayouts.length !== 2) {
      return { ok: false, reason: 'NON_BINARY_OUTCOME_SLOTS' };
    }
    const p0 = Number(rawPayouts[0]);
    const p1 = Number(rawPayouts[1]);
    if (!Number.isSafeInteger(p0) || !Number.isSafeInteger(p1) || p0 < 0 || p1 < 0
      || !((p0 > 0 && p1 === 0) || (p0 === 0 && p1 > 0))) {
      return { ok: false, reason: 'AMBIGUOUS_OR_INVALID_PAYOUT_VECTOR' };
    }
    return {
      ok: true,
      decoded: { conditionId, oracleAddress, ctfQuestionId, payoutNumerators: [p0, p1] },
    };
  } catch {
    return { ok: false, reason: 'CONDITION_RESOLUTION_ABI_DECODE_FAILED' };
  }
}
