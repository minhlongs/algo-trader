import { generateKeyPairSync } from 'node:crypto';
import { AbiCoder, Interface } from 'ethers';
import {
  CANONICAL_POLYGON_CTF_CONTRACT,
  CONDITION_RESOLUTION_EVENT_SIGNATURE,
  MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS,
  POLYGON_POS_CHAIN_ID,
  POLYGON_POS_NETWORK,
  SETTLEMENT_VERIFICATION_RECEIPT_VERSION,
  signSettlementVerificationReceipt,
  type ChainBlockHeader,
  type ChainSettlementProvider,
  type ChainTransactionReceipt,
  type MarketConditionMapping,
  type SettlementProvenance,
  type SettlementReceiptSigner,
  type SettlementVerificationReceipt,
  type SettlementVerificationReceiptBody,
  type TrustedSettlementVerifierRegistry,
  type UmaDisputeStatus,
} from '../../../src/desk/polymarket/market-blind/market-blind-prospective-pipeline';

const ctfIface = new Interface([
  'event ConditionResolution(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256 outcomeSlotCount, uint256[] payoutNumerators)',
]);
const abiCoder = AbiCoder.defaultAbiCoder();

export interface VerifierFixtureBundle {
  readonly signer: SettlementReceiptSigner;
  readonly registry: TrustedSettlementVerifierRegistry;
  readonly publicKeyPem: string;
  readonly privateKeyPem: string;
  buildSignedProvenance(params: {
    marketId: string;
    eventId?: string;
    resolvedAtMs: number;
    index?: number;
    payoutNumerators?: readonly [number, number];
    finalityStatus?: 'FINALIZED' | 'CORRECTED';
    correctionReason?: string;
    supersedesReceiptDigest?: string;
    verifiedConfirmations?: number;
    receiptOverrides?: Partial<SettlementVerificationReceiptBody>;
    provenanceOverrides?: Partial<SettlementProvenance>;
  }): SettlementProvenance;
}

export function createOfflineVerifierFixture(
  verifierId = 'offline-verifier-fixture-v1',
  verifierVersion = '1.0.0',
  validFromMs = 1,
  validUntilMs = Date.UTC(2035, 0, 1),
): VerifierFixtureBundle {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  const signer: SettlementReceiptSigner = {
    verifierId,
    verifierVersion,
    privateKeyPem,
  };
  const registry: TrustedSettlementVerifierRegistry = {
    authorities: [{
      verifierId,
      verifierVersion,
      publicKeyPem,
      status: 'ACTIVE',
      validFromMs,
      validUntilMs,
    }],
  };

  function buildSignedProvenance(params: {
    marketId: string;
    eventId?: string;
    resolvedAtMs: number;
    index?: number;
    payoutNumerators?: readonly [number, number];
    finalityStatus?: 'FINALIZED' | 'CORRECTED';
    correctionReason?: string;
    supersedesReceiptDigest?: string;
    verifiedConfirmations?: number;
    receiptOverrides?: Partial<SettlementVerificationReceiptBody>;
    provenanceOverrides?: Partial<SettlementProvenance>;
  }): SettlementProvenance {
    const idx = params.index ?? 1;
    const conditionId = `0x${idx.toString(16).padStart(64, 'a')}`;
    const txHash = `0x${idx.toString(16).padStart(64, 'b')}`;
    const blockHash = `0x${idx.toString(16).padStart(64, 'e')}`;
    const ctfQuestionId = `0x${idx.toString(16).padStart(64, 'f')}`;
    const blockNumber = 65_000_000 + idx;
    const payoutNumerators = params.payoutNumerators ?? [1, 0];
    const verifiedConfirmations = params.verifiedConfirmations ?? MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS;
    const finalityStatus = params.finalityStatus ?? 'FINALIZED';

    const body: SettlementVerificationReceiptBody = {
      version: SETTLEMENT_VERIFICATION_RECEIPT_VERSION,
      network: POLYGON_POS_NETWORK,
      chainId: POLYGON_POS_CHAIN_ID,
      verifierId,
      verifierVersion,
      contractAddress: CANONICAL_POLYGON_CTF_CONTRACT,
      txHash,
      blockNumber,
      blockHash,
      blockTimestampMs: params.resolvedAtMs,
      eventSignature: CONDITION_RESOLUTION_EVENT_SIGNATURE,
      logIndex: 0,
      conditionId,
      oracleAddress: '0x157ce2d672854c848c9b79c49a8cc6cc89176a49',
      ctfQuestionId,
      marketId: params.marketId,
      ...(params.eventId ? { eventId: params.eventId } : {}),
      finalityStatus,
      ...(params.correctionReason ? { correctionReason: params.correctionReason } : {}),
      ...(params.supersedesReceiptDigest ? { supersedesReceiptDigest: params.supersedesReceiptDigest } : {}),
      payoutNumerators,
      verifiedConfirmations,
      verifiedAtMs: params.resolvedAtMs + 500,
      ...params.receiptOverrides,
    };

    const verificationReceipt: SettlementVerificationReceipt = signSettlementVerificationReceipt(body, privateKeyPem);
    return {
      source: 'CTF_ONCHAIN',
      finalityStatus,
      marketId: params.marketId,
      ...(params.eventId ? { eventId: params.eventId } : {}),
      conditionId: body.conditionId,
      txHash: body.txHash,
      blockNumber: body.blockNumber,
      confirmations: body.verifiedConfirmations,
      payoutNumerators: body.payoutNumerators,
      observedAtMs: params.resolvedAtMs + 500,
      payloadHash: verificationReceipt.canonicalPayloadDigest,
      reference: `polygon-ctf-${params.marketId}`,
      ...(params.correctionReason ? { correctionReason: params.correctionReason } : {}),
      verificationReceipt,
      ...params.provenanceOverrides,
    };
  }

  return { signer, registry, publicKeyPem, privateKeyPem, buildSignedProvenance };
}

export function encodeConditionResolutionLog(params: {
  address?: string;
  logIndex?: number;
  conditionId: string;
  oracleAddress: string;
  ctfQuestionId: string;
  outcomeSlotCount?: number;
  payoutNumerators: readonly [number, number];
}) {
  const event = ctfIface.getEvent('ConditionResolution')!;
  const encoded = ctfIface.encodeEventLog(event, [
    params.conditionId,
    params.oracleAddress,
    params.ctfQuestionId,
    BigInt(params.outcomeSlotCount ?? 2),
    params.payoutNumerators.map((n) => BigInt(n)),
  ]);
  return {
    address: params.address ?? CANONICAL_POLYGON_CTF_CONTRACT,
    logIndex: params.logIndex ?? 0,
    topics: encoded.topics,
    data: encoded.data,
  };
}

export function encodeOrderFilledWrongEventLog(params: { address?: string; logIndex?: number }) {
  const orderTopic = '0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec0f6';
  return {
    address: params.address ?? CANONICAL_POLYGON_CTF_CONTRACT,
    logIndex: params.logIndex ?? 0,
    topics: [orderTopic],
    data: abiCoder.encode(['uint256', 'uint256'], [1n, 0n]),
  };
}

export interface MockChainState {
  chainId: number;
  latestBlock: ChainBlockHeader | null;
  blocksByNumber: Map<number, ChainBlockHeader>;
  receiptsByTxHash: Map<string, ChainTransactionReceipt>;
  marketMappings: Map<string, MarketConditionMapping>;
  umaDisputes: Map<string, UmaDisputeStatus>;
}

export function createMockChainProvider(state: MockChainState): ChainSettlementProvider {
  return {
    getChainId: async () => state.chainId,
    getLatestBlock: async () => state.latestBlock,
    getBlockByNumber: async (n) => state.blocksByNumber.get(n) ?? null,
    getTransactionReceipt: async (txHash) => state.receiptsByTxHash.get(txHash.toLowerCase()) ?? null,
    getMarketConditionMapping: async (marketId) => state.marketMappings.get(marketId) ?? null,
    getUmaDisputeStatus: async (conditionId) => state.umaDisputes.get(conditionId.toLowerCase()) ?? { state: 'NONE' },
  };
}
