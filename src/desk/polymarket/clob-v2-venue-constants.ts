/**
 * Polymarket CLOB V2 — venue constants and the order-intent vocabulary.
 *
 * The mandatory V2 cutover (2026-04-28 11:00 UTC) deleted every open V1 order
 * with no compatibility window, moved the EIP-712 domain to ExchangeV3
 * (`version: "3"`), and replaced USDC.e with pUSD. Everything the report pins
 * about that surface lives here so a later tuning pass cannot drift from it.
 *
 * NOT VERIFIED AGAINST THE LIVE ENDPOINT: this environment holds no
 * `POLY_PRIVATE_KEY` and no CLOB API credentials, so these numbers are pinned by
 * unit tests only. Re-check them against the live API before the first real order.
 */

/** Polymarket International settles in pUSD on Polygon, not USDC.e. */
export const PUSD_COLLATERAL_ADDRESS = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';

/** The retired V1 exchange — signing against it is a no-op on live. */
export const V1_CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

export const EXCHANGE_V3_DOMAIN_NAME = 'Polymarket CTF Exchange';
export const EXCHANGE_V3_DOMAIN_VERSION = '3';
export const POLYGON_CHAIN_ID = 137;

/** Builder codes are the fee leak the report sizes at up to 100 bps of notional. */
export const ZERO_BUILDER_CODE = `0x${'0'.repeat(64)}`;

/** Minimum resting size the exchange accepts on a GTC/GTD order. */
export const MIN_RESTING_ORDER_SHARES = 5;

/** HTTP status the matching engine returns while it restarts. */
export const ENGINE_RESTARTING_HTTP_STATUS = 425;

/** After a 425 the venue accepts post-only orders only, for two minutes. */
export const ENGINE_RESTART_POST_ONLY_MS = 120_000;

/**
 * Deposit-wallet signature scheme (ERC-1967 proxy + EIP-1271). V1 used 0 (EOA),
 * 1 (POLY_PROXY) and 2 (POLY_GNOSIS_SAFE), so Poly1271 takes the next slot.
 */
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
  /** Required for GTD; unix seconds. */
  expiration?: number;
  postOnly?: boolean;
  /** Must stay zero: non-zero third-party builder codes add a fee surcharge. */
  builderCode?: string;
  nonce?: string;
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
  /** ExchangeV3 verifying contract. Required — never guess, never fall back to V1. */
  verifyingContract: string;
  chainId?: number;
  /** Defaults to `POLY_1271_SIGNATURE_TYPE` (3); configurable for EOA/proxy/Safe wallets. */
  signatureType?: 0 | 1 | 2 | typeof POLY_1271_SIGNATURE_TYPE;
}
