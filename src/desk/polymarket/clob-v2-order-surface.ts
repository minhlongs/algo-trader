/**
 * Polymarket CLOB V2 order surface — ExchangeV3 / pUSD / Poly1271.
 *
 * The mandatory V2 cutover (2026-04-28 11:00 UTC) deleted every open V1 order
 * with no compatibility window, moved the EIP-712 domain to ExchangeV3
 * (`version: "3"`), replaced USDC.e with pUSD, and moved `POST /order` onto an
 * asynchronous execution pipeline. The V1 SDKs are frozen, so this surface is
 * built here instead of by mutating the V1 signer at `../execution/polymarket-signer`:
 *
 *   - the venue facts (addresses, limits, the 425 window) → clob-v2-venue-constants
 *   - ExchangeV3 EIP-712 signing and order hashing       → clob-v2-order-signing
 *   - the pre-signing gate                               → clob-v2-order-validation
 *   - async submit outcomes and the restart cooldown     → clob-v2-submit-classifier
 *
 * NOT VERIFIED AGAINST THE LIVE ENDPOINT: no CLOB credentials are present, so the
 * signing path is pinned by unit tests against a fake key only. The report also
 * does not publish the ExchangeV3 verifying-contract address, which is why it is
 * an injected config rather than a constant — a guessed address yields signatures
 * the exchange silently rejects.
 */

export {
  ENGINE_RESTARTING_HTTP_STATUS,
  ENGINE_RESTART_POST_ONLY_MS,
  EXCHANGE_V3_DOMAIN_NAME,
  EXCHANGE_V3_DOMAIN_VERSION,
  MIN_RESTING_ORDER_SHARES,
  POLYGON_CHAIN_ID,
  POLY_1271_SIGNATURE_TYPE,
  PUSD_COLLATERAL_ADDRESS,
  V1_CTF_EXCHANGE_ADDRESS,
  ZERO_BUILDER_CODE,
  type ClobV2ExchangeConfig,
  type ClobV2OrderIntent,
  type ClobV2OrderType,
  type ClobV2OrderValidation,
  type ClobV2RejectionCode,
} from './clob-v2-venue-constants';

export {
  buildClobV2TypedData,
  computeClobV2OrderHash,
  signClobV2Order,
  type ClobV2SignedOrder,
} from './clob-v2-order-signing';

export { validateClobV2Order } from './clob-v2-order-validation';

export {
  EngineRestartCooldown,
  classifyClobV2SubmitResponse,
  expirationFromNowMs,
  gateOrderThroughCooldown,
  type ClobV2SubmitOutcome,
} from './clob-v2-submit-classifier';
