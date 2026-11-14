/**
 * Polymarket CLOB V2 — Isolated `Poly1271` Session Key Runtime Signer.
 *
 * Enforces strict separation between the ERC-1967 / EIP-1271 Deposit Wallet
 * (`maker`, `signatureType = 3`) and the trading runtime's Session Key EOA
 * (`signer`). Refuses to boot if an owner/master private key is supplied to
 * the runtime or leaked in environment (`MASTER_KEY_FORBIDDEN_IN_RUNTIME`).
 */

import { ethers } from 'ethers';
import {
  POLYGON_CHAIN_ID,
  POLY_1271_SIGNATURE_TYPE,
  PUSD_COLLATERAL_ADDRESS,
  V1_CTF_EXCHANGE_ADDRESS,
  ZERO_BUILDER_CODE,
  type ClobV2OrderIntent,
} from './clob-v2-venue-constants';
import { buildClobV2TypedData, signClobV2Order, type ClobV2SignedOrder } from './clob-v2-order-signing';
import { validateClobV2Order } from './clob-v2-order-validation';

export type Poly1271IsolationErrorCode =
  | 'MASTER_KEY_FORBIDDEN_IN_RUNTIME'
  | 'MISSING_SESSION_SIGNER'
  | 'SESSION_KEY_EQUALS_DEPOSIT_WALLET'
  | 'INVALID_EXCHANGE_V3_CONTRACT'
  | 'INVALID_COLLATERAL_TOKEN'
  | 'ORDER_VALIDATION_FAILED'
  | 'SIGNATURE_RECOVERY_MISMATCH';

export class Poly1271IsolationError extends Error {
  readonly code: Poly1271IsolationErrorCode;

  constructor(code: Poly1271IsolationErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'Poly1271IsolationError';
    this.code = code;
  }
}

export type RemoteTypedDataSigner = (
  domain: ethers.TypedDataDomain,
  types: Record<string, ethers.TypedDataField[]>,
  value: Record<string, unknown>,
) => Promise<string>;

export interface Poly1271SessionSignerConfig {
  depositWalletAddress: string;
  verifyingContract: string;
  sessionPrivateKey?: string;
  remoteSignTypedData?: RemoteTypedDataSigner;
  sessionSignerAddress?: string;
  ownerMasterPrivateKey?: unknown;
  collateralToken?: string;
  runtimeEnv?: Record<string, string | undefined>;
}

export interface Poly1271SignedOrder extends ClobV2SignedOrder {
  signer: string;
  signatureType: typeof POLY_1271_SIGNATURE_TYPE;
  collateralToken: typeof PUSD_COLLATERAL_ADDRESS;
  chainId: typeof POLYGON_CHAIN_ID;
}

class RemoteEip712Signer extends ethers.AbstractSigner {
  constructor(
    private readonly signerAddress: string,
    private readonly signCallback: RemoteTypedDataSigner,
  ) {
    super();
  }
  async getAddress(): Promise<string> { return this.signerAddress; }
  connect(): ethers.Signer { return this; }
  async signTransaction(): Promise<string> { throw new Error('Poly1271SessionSigner forbids raw L1/L2 tx signing'); }
  async signMessage(): Promise<string> { throw new Error('Poly1271SessionSigner allows ExchangeV3 EIP-712 only'); }
  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, unknown>,
  ): Promise<string> {
    return this.signCallback(domain, types, value);
  }
}

const FORBIDDEN_MASTER_ENV_KEYS = ['POLY_OWNER_MASTER_PRIVATE_KEY', 'POLY_DEPOSIT_OWNER_PRIVATE_KEY'] as const;

export class Poly1271SessionSigner {
  readonly depositWalletAddress: string;
  readonly sessionSignerAddress: string;
  readonly verifyingContract: string;
  private readonly signer: ethers.Signer;

  constructor(config: Poly1271SessionSignerConfig) {
    const env = config.runtimeEnv ?? (typeof process !== 'undefined' ? process.env : undefined);
    const leakedMaster = FORBIDDEN_MASTER_ENV_KEYS.some((k) => Boolean(env?.[k]?.trim()));
    const matchesMaster = Boolean(
      config.sessionPrivateKey &&
      FORBIDDEN_MASTER_ENV_KEYS.some((k) => env?.[k]?.trim().toLowerCase() === config.sessionPrivateKey?.trim().toLowerCase()),
    );
    if (config.ownerMasterPrivateKey !== undefined || leakedMaster || matchesMaster) {
      throw new Poly1271IsolationError(
        'MASTER_KEY_FORBIDDEN_IN_RUNTIME',
        'Owner/master Deposit Wallet private key is strictly forbidden inside the trading runtime',
      );
    }

    const depositWallet = ethers.getAddress(config.depositWalletAddress);
    const verifyingContract = ethers.getAddress(config.verifyingContract);
    if (verifyingContract.toLowerCase() === V1_CTF_EXCHANGE_ADDRESS.toLowerCase()) {
      throw new Poly1271IsolationError('INVALID_EXCHANGE_V3_CONTRACT', 'Retired V1 CTF Exchange address rejected');
    }
    if (
      config.collateralToken !== undefined &&
      ethers.getAddress(config.collateralToken).toLowerCase() !== PUSD_COLLATERAL_ADDRESS.toLowerCase()
    ) {
      throw new Poly1271IsolationError('INVALID_COLLATERAL_TOKEN', `Expected pUSD collateral ${PUSD_COLLATERAL_ADDRESS}`);
    }

    if (config.sessionPrivateKey) {
      const wallet = new ethers.Wallet(config.sessionPrivateKey);
      this.signer = wallet;
      this.sessionSignerAddress = wallet.address;
    } else if (config.remoteSignTypedData && config.sessionSignerAddress) {
      const addr = ethers.getAddress(config.sessionSignerAddress);
      this.signer = new RemoteEip712Signer(addr, config.remoteSignTypedData);
      this.sessionSignerAddress = addr;
    } else {
      throw new Poly1271IsolationError(
        'MISSING_SESSION_SIGNER',
        'Provide either sessionPrivateKey or (remoteSignTypedData + sessionSignerAddress)',
      );
    }

    if (this.sessionSignerAddress.toLowerCase() === depositWallet.toLowerCase()) {
      throw new Poly1271IsolationError(
        'SESSION_KEY_EQUALS_DEPOSIT_WALLET',
        'Session Key EOA must be distinct from the ERC-1967 Deposit Wallet proxy address',
      );
    }

    this.depositWalletAddress = depositWallet;
    this.verifyingContract = verifyingContract;
  }

  async signOrder(intent: ClobV2OrderIntent, engineRestartPostOnly = false): Promise<Poly1271SignedOrder> {
    const normalized: ClobV2OrderIntent = { ...intent, builderCode: intent.builderCode ?? ZERO_BUILDER_CODE };
    const validation = validateClobV2Order(normalized, engineRestartPostOnly);
    if (!validation.ok) {
      throw new Poly1271IsolationError('ORDER_VALIDATION_FAILED', `${validation.code}: ${validation.detail}`);
    }

    const exchangeCfg = {
      verifyingContract: this.verifyingContract,
      chainId: POLYGON_CHAIN_ID,
      signatureType: POLY_1271_SIGNATURE_TYPE,
    } as const;
    const signed = await signClobV2Order(this.signer, normalized, exchangeCfg);
    const typed = buildClobV2TypedData(normalized, exchangeCfg);
    let recovered = '';
    try {
      recovered = ethers.verifyTypedData(typed.domain, { Order: typed.types.Order }, typed.message, signed.signature);
    } catch {
      recovered = '';
    }
    if (recovered.toLowerCase() !== this.sessionSignerAddress.toLowerCase()) {
      throw new Poly1271IsolationError(
        'SIGNATURE_RECOVERY_MISMATCH',
        `Recovered EIP-712 signer ${recovered || 'invalid'} does not match session key ${this.sessionSignerAddress}`,
      );
    }

    return {
      order: normalized,
      signature: signed.signature,
      maker: this.depositWalletAddress,
      signer: this.sessionSignerAddress,
      signatureType: POLY_1271_SIGNATURE_TYPE,
      collateralToken: PUSD_COLLATERAL_ADDRESS,
      chainId: POLYGON_CHAIN_ID,
      orderHash: signed.orderHash,
    };
  }
}
