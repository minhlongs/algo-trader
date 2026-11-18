/**
 * Polymarket CLOB V2 — venue constants and the order-intent vocabulary.
 *
 * Aligns contract addresses, EIP-712 domain constants, and signature types with
 * `@polymarket/clob-client-v2` (`getContractConfig(137)` and `SignatureTypeV2`),
 * while preserving the ExchangeV3 domain version override (`"3"`) for forward
 * compatibility and keeping live execution disabled by default (#272).
 */

/** Polymarket International settles in pUSD on Polygon, not USDC.e. */
export const PUSD_COLLATERAL_ADDRESS = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';

/** The retired V1 exchange — signing against it is rejected fail-closed. */
export const V1_CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

/** Official CLOB V2 CTF Exchange contract on Polygon (Chain 137) from `@polymarket/clob-client-v2`. */
export const CLOB_V2_EXCHANGE_POLYGON_ADDRESS = '0xE111180000d2663C0091e4f400237545B87B996B';

/** Official CLOB V2 NegRisk CTF Exchange contract on Polygon (Chain 137) from `@polymarket/clob-client-v2`. */
export const CLOB_V2_NEG_RISK_EXCHANGE_POLYGON_ADDRESS =
  '0xe2222d279d744050d28e00520010520000310F59';

export const EXCHANGE_V3_DOMAIN_NAME = 'Polymarket CTF Exchange';
/** Domain version in `@polymarket/clob-client-v2` (`CTF_EXCHANGE_V2_DOMAIN_VERSION`). */
export const EXCHANGE_V2_DOMAIN_VERSION = '2';
/** Explicit ExchangeV3 domain version override retained for vNext callers. */
export const EXCHANGE_V3_DOMAIN_VERSION = '3';
export const POLYGON_CHAIN_ID = 137;

/** Zero bytes32 builder code (non-zero third-party builder codes add fee surcharges). */
export const ZERO_BUILDER_CODE = `0x${'0'.repeat(64)}`;
/** Zero bytes32 order metadata default matching `@polymarket/clob-client-v2`. */
export const ZERO_METADATA_BYTES32 = `0x${'0'.repeat(64)}`;

/** Minimum resting size the exchange accepts on a GTC/GTD order. */
export const MIN_RESTING_ORDER_SHARES = 5;

/** HTTP status the matching engine returns while it restarts. */
export const ENGINE_RESTARTING_HTTP_STATUS = 425;

/** After a 425 the venue accepts post-only orders only, for two minutes. */
export const ENGINE_RESTART_POST_ONLY_MS = 120_000;

/** Deposit-wallet signature scheme (`SignatureTypeV2.POLY_1271 === 3`). */
export const POLY_1271_SIGNATURE_TYPE = 3;

export type ClobV2OrderType = 'GTC' | 'GTD' | 'FOK' | 'FAK';

export interface ClobV2OrderIntent {
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  orderType: ClobV2OrderType;
  /** Per-market, read from the venue's tick-size endpoint. */
  tickSize: number;
  /** Transport-only in CLOB V2; unix seconds (`0` = no expiration). */
  expiration?: number;
  postOnly?: boolean;
  /** Must stay zero: non-zero third-party builder codes add a fee surcharge. */
  builderCode?: string;
  /** Session / replay floor tracking (transport / local governance in V2). */
  nonce?: string;
  /** Deterministic uint256 salt string for EIP-712 signing (`Order.salt`). */
  salt?: string;
  /** Unix ms timestamp string signed inside `Order.timestamp`. */
  timestamp?: string;
  /** `bytes32` metadata signed inside `Order.metadata`. */
  metadata?: string;
}

export type ClobV2RejectionCode =
  | 'builder-code-forbidden'
  | 'size-below-minimum'
  | 'price-off-tick'
  | 'price-out-of-range'
  | 'gtd-requires-expiration'
  | 'post-only-required-while-engine-restarting';

export type ClobV2OrderValidation =
  | { ok: true; order: ClobV2OrderIntent }
  | { ok: false; code: ClobV2RejectionCode; detail: string };

export interface ClobV2ExchangeConfig {
  /** Verifying contract (`CLOB_V2_EXCHANGE_POLYGON_ADDRESS` or NegRisk V2). Never V1. */
  verifyingContract: string;
  chainId?: number;
  /** Domain version (`"2"` per `@polymarket/clob-client-v2`, or `"3"` override). */
  domainVersion?: '2' | '3';
  /** Defaults to `POLY_1271_SIGNATURE_TYPE` (3); configurable for EOA/proxy/Safe wallets. */
  signatureType?: 0 | 1 | 2 | typeof POLY_1271_SIGNATURE_TYPE;
  /** Deposit/funding wallet (`Order.maker`). */
  maker?: string;
  /** Session or EOA signing address (`Order.signer`). Defaults to `maker` when omitted. */
  signer?: string;
}
