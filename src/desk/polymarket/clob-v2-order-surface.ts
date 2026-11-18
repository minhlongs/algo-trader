/**
 * Polymarket CLOB V2 order surface — ExchangeV2/V3 / pUSD / Poly1271 (#272).
 */

export {
  CLOB_V2_EXCHANGE_POLYGON_ADDRESS,
  CLOB_V2_NEG_RISK_EXCHANGE_POLYGON_ADDRESS,
  ENGINE_RESTARTING_HTTP_STATUS,
  ENGINE_RESTART_POST_ONLY_MS,
  EXCHANGE_V2_DOMAIN_VERSION,
  EXCHANGE_V3_DOMAIN_NAME,
  EXCHANGE_V3_DOMAIN_VERSION,
  MIN_RESTING_ORDER_SHARES,
  POLYGON_CHAIN_ID,
  POLY_1271_SIGNATURE_TYPE,
  PUSD_COLLATERAL_ADDRESS,
  V1_CTF_EXCHANGE_ADDRESS,
  ZERO_BUILDER_CODE,
  ZERO_METADATA_BYTES32,
  type ClobV2ExchangeConfig,
  type ClobV2OrderIntent,
  type ClobV2OrderType,
  type ClobV2OrderValidation,
  type ClobV2RejectionCode,
} from './clob-v2-venue-constants';

export {
  CLOB_V2_ORDER_FIELD_TYPES,
  buildClobV2TypedData,
  computeClobV2OrderHash,
  signClobV2Order,
  type ClobV2SignedOrder,
  type ClobV2SignedOrderMessage,
} from './clob-v2-order-signing';

export {
  verifyClobV2SignedOrder,
  type ClobV2VerifyFailureCode,
  type ClobV2VerifyResult,
} from './clob-v2-order-verifier';

export {
  buildClobV2TransportPayload,
  type ClobV2TransportOptions,
  type ClobV2TransportPayload,
} from './clob-v2-order-transport';

export { validateClobV2Order } from './clob-v2-order-validation';

export {
  EngineRestartCooldown,
  classifyClobV2SubmitResponse,
  expirationFromNowMs,
  gateOrderThroughCooldown,
  type ClobV2SubmitOutcome,
} from './clob-v2-submit-classifier';
