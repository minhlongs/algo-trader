/**
 * Binance Spot Trading Types
 * Types for Spot REST API and WebSocket
 * Docs: https://binance-docs.github.io/apidocs/spot/en/
 */

/**
 * Order side for spot trading
 */
export enum BinanceOrderSide {
  BUY = 'BUY',
  SELL = 'SELL'
}

/**
 * Order types supported by Binance Spot
 */
export enum BinanceOrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
  STOP_LOSS = 'STOP_LOSS',
  STOP_LOSS_LIMIT = 'STOP_LOSS_LIMIT',
  TAKE_PROFIT = 'TAKE_PROFIT',
  TAKE_PROFIT_LIMIT = 'TAKE_PROFIT_LIMIT',
  LIMIT_MAKER = 'LIMIT_MAKER',
  IOC = 'IOC',
  FOK = 'FOK'
}

/**
 * Time in force options
 */
export enum BinanceTimeInForce {
  GTC = 'GTC',
  IOC = 'IOC',
  FOK = 'FOK'
}

/**
 * Order status lifecycle
 */
export enum BinanceOrderStatus {
  NEW = 'NEW',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELED = 'CANCELED',
  PENDING_CANCEL = 'PENDING_CANCEL',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

/**
 * Margin type for spot margin trading
 */
export enum BinanceMarginType {
  CROSS = 'CROSS',
  ISOLATED = 'ISOLATED'
}

/**
 * Position side for margin (for isolated margin)
 */
export enum BinancePositionSide {
  BOTH = 'BOTH',
  LONG = 'LONG',
  SHORT = 'SHORT'
}

/**
 * Symbol status
 */
export enum BinanceSymbolStatus {
  TRADING = 'TRADING',
  PRE_TRADING = 'PRE_TRADING',
  POST_TRADING = 'POST_TRADING',
  HALT = 'HALT'
}

/**
 * Normalized Binance spot order object
 */
export interface BinanceOrder {
  readonly symbol: string;
  readonly orderId: number;
  readonly clientOrderId: string;
  readonly side: BinanceOrderSide;
  readonly type: BinanceOrderType;
  readonly price: string;
  readonly origQty: string;
  readonly executedQty: string;
  readonly cummulativeQuoteQty: string;
  readonly status: BinanceOrderStatus;
  readonly timeInForce: BinanceTimeInForce;
  readonly stopPrice?: string;
  readonly icebergQty?: string;
  readonly avgPrice?: string;
  readonly origType?: BinanceOrderType;
  readonly updateTime: number;
  readonly isWorking: boolean;
  readonly marginBuyBorrowAmount?: string;
  readonly marginBuyBorrowAsset?: string;
  readonly selfTradePreventionMode?: string;
}

/**
 * Request parameters for placing a new spot order
 */
export interface PlaceSpotOrderRequest {
  symbol: string;
  side: BinanceOrderSide;
  type: BinanceOrderType;
  quantity: string;
  price?: string;
  timeInForce?: BinanceTimeInForce;
  stopPrice?: string;
  stopLimitPrice?: string;
  stopLimitTimeInForce?: BinanceTimeInForce;
  icebergQty?: string;
  newOrderRespType?: 'ACK' | 'RESULT' | 'FULL';
  quoteOrderQty?: string;
  clientOrderId?: string;
  recvWindow?: number;
}

/**
 * Request for margin account order
 */
export interface PlaceMarginOrderRequest extends PlaceSpotOrderRequest {
  isIsolated?: boolean;
  sideEffectType?: 'NO_SIDE_EFFECT' | 'MARGIN_BUY' | 'AUTO_REPAY' | 'AUTO_BORROW';
}

/**
 * Spot account balance
 */
export interface SpotBalance {
  readonly asset: string;
  readonly free: string;
  readonly locked: string;
  readonly withdrawAvailable?: string;
}

/**
 * Margin account balance
 */
export interface MarginBalance {
  readonly asset: string;
  readonly borrowEnabled: boolean;
  readonly borrowed: string;
  readonly interest: string;
  readonly netAsset: string;
}

/**
 * Cross-collateral (multi-asset margin) data
 */
export interface CrossCollateralData {
  readonly collateral: string[];
  readonly collateralAssets: Array<{
    asset: string;
    amount: string;
    loanToValueRatio: string;
  }>;
}

/**
 * Account information
 */
export interface AccountInfo {
  readonly makerCommission: number;
  readonly takerCommission: number;
  readonly buyerCommission: number;
  readonly sellerCommission: number;
  readonly canTrade: boolean;
  readonly canWithdraw: boolean;
  readonly canDeposit: boolean;
  readonly updateTime: number;
  readonly accountType: 'SPOT' | 'MARGIN' | 'ISOLATED_MARGIN';
  readonly balances: SpotBalance[];
  readonly permissions: string[];
}

/**
 * 24hr ticker statistics
 */
export interface Binance24hTicker {
  readonly symbol: string;
  readonly priceChange: string;
  readonly priceChangePercent: string;
  readonly weightedAvgPrice: string;
  readonly prevClosePrice: string;
  readonly lastPrice: string;
  readonly lastQty: string;
  readonly bidPrice: string;
  readonly bidQty: string;
  readonly askPrice: string;
  readonly askQty: string;
  readonly openPrice: string;
  readonly highPrice: string;
  readonly lowPrice: string;
  readonly volume: string;
  readonly quoteVolume: string;
  readonly openTime: number;
  readonly closeTime: number;
  readonly firstId: number;
  readonly lastId: number;
  readonly count: number;
}

/**
 * Order book level
 */
export interface OrderBookLevel {
  readonly price: string;
  readonly quantity: string;
}

/**
 * Order book (L2)
 */
export interface OrderBook {
  readonly lastUpdateId: number;
  readonly bids: OrderBookLevel[];
  readonly asks: OrderBookLevel[];
  readonly symbol: string;
}

/**
 * Recent trade
 */
export interface Trade {
  readonly id: number;
  readonly price: string;
  readonly qty: string;
  readonly quoteQty: string;
  readonly time: number;
  readonly isBuyerMaker: boolean;
  readonly isBestMatch: boolean;
}

/**
 * Kline/Candlestick
 */
export interface Kline {
  readonly openTime: number;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
  readonly closeTime: number;
  readonly quoteAssetVolume: string;
  readonly trades: number;
  readonly takerBuyBaseAssetVolume: string;
  readonly takerBuyQuoteAssetVolume: string;
  readonly ignored: string;
}

/**
 * Exchange info for a symbol
 */
export interface SymbolInfo {
  readonly symbol: string;
  readonly status: BinanceSymbolStatus;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly baseAssetPrecision: number;
  readonly quoteAssetPrecision: number;
  readonly quotePrecision: number;
  readonly orderTypes: BinanceOrderType[];
  readonly icebergAllowed: boolean;
  readonly ocoAllowed: boolean;
  readonly otcAllowed: boolean;
  readonly isSpotTradingAllowed: boolean;
  readonly isMarginTradingAllowed: boolean;
  readonly pricePrecision: number;
  readonly quantityPrecision: number;
  readonly minQty: string;
  readonly maxQty: string;
  readonly minNotional: string;
  readonly stepSize: string;
  readonly tickSize: string;
}

/**
 * Binance Leveraged ETF (LETF) information
 */
export interface LeveragedEtfInfo {
  readonly symbol: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly underlying: string;
  readonly leverage: number;
  readonly minNotional: string;
  readonly pricePrecision: number;
  readonly quantityPrecision: number;
  readonly rebalancingEnabled: boolean;
}

/**
 * ETF rebalancing notice
 */
export interface EtfRebalanceEvent {
  readonly symbol: string;
  readonly eventType: 'ETF_REBALANCE';
  readonly rebalanceTime: number;
  readonly targetLeverage: number;
  readonly currentLeverage: number;
  readonly reason: 'DAILY' | 'THRESHOLD' | 'MANUAL';
}

/**
 * WebSocket event types for spot user data stream
 */
export enum BinanceWSEventType {
  ACCOUNT_UPDATE = 'accountUpdate',
  ORDER_TRADE_UPDATE = 'orderTradeUpdate',
  TRADE_UPDATE = 'tradeUpdate',
  MARGIN_CALL = 'marginCall',
  BALANCE_UPDATE = 'balanceUpdate',
  KLINE = 'kline',
  TRADE = 'trade',
  TICKER = 'ticker',
  TICKER_24HR = '24hrTicker',
  DEPTH = 'depth',
  PARTIAL_DEPTH = 'partialDepth',
  USER_DATA_STREAM = 'userData'
}

/**
 * Account update event
 */
export interface AccountUpdateEvent {
  readonly type: BinanceWSEventType.ACCOUNT_UPDATE;
  readonly eventTime: number;
  readonly balances: Array<{
    asset: string;
    free: string;
    locked: string;
    crossWalletBalance?: string;
    crossUnPnl?: string;
    marginBalance?: string;
    walletBalance?: string;
  }>;
  readonly positions?: Array<{
    symbol: string;
    positionAmount: string;
    entryPrice: string;
    markPrice?: string;
    unRealizedProfit?: string;
    positionSide?: 'LONG' | 'SHORT' | 'BOTH';
  }>;
}

/**
 * Order/trade update event
 */
export interface OrderTradeUpdateEvent {
  readonly type: BinanceWSEventType.ORDER_TRADE_UPDATE;
  readonly eventTime: number;
  readonly order: {
    symbol: string;
    orderId: number;
    clientOrderId: string;
    price: string;
    origQty: string;
    executedQty: string;
    cummulativeQuoteQty: string;
    status: BinanceOrderStatus;
    timeInForce: BinanceTimeInForce;
    type: BinanceOrderType;
    side: BinanceOrderSide;
    stopPrice?: string;
    icebergQty?: string;
    time: number;
    updateTime: number;
    isWorking: boolean;
    marginBuyBorrowAmount?: string;
    marginBuyBorrowAsset?: string;
  };
  readonly lastTrade?: {
    price: string;
    qty: string;
    buyerOrderId: number;
    sellerOrderId: number;
    time: number;
  };
}

/**
 * Trade event (market data)
 */
export interface TradeEvent {
  readonly type: BinanceWSEventType.TRADE;
  readonly eventTime: number;
  readonly symbol: string;
  readonly tradeId: number;
  readonly price: string;
  readonly quantity: string;
  readonly buyerOrderId: number;
  readonly sellerOrderId: number;
  readonly tradeTime: number;
  readonly isBuyerMaker: boolean;
  readonly isBestMatch: boolean;
}

/**
 * Kline event
 */
export interface KlineEvent {
  readonly type: BinanceWSEventType.KLINE;
  readonly eventTime: number;
  readonly symbol: string;
  readonly kline: {
    startTime: number;
    closeTime: number;
    symbol: string;
    interval: string;
    firstTradeId: number;
    lastTradeId: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    quoteAssetVolume: string;
    trades: number;
    isFinal: boolean;
    takerBuyBaseAssetVolume: string;
    takerBuyQuoteAssetVolume: string;
    ignore: string;
  };
}

/**
 * Order book depth event
 */
export interface DepthEvent {
  readonly type: BinanceWSEventType.DEPTH;
  readonly eventTime: number;
  readonly symbol: string;
  readonly firstUpdateId: number;
  readonly finalUpdateId: number;
  readonly bids: OrderBookLevel[];
  readonly asks: OrderBookLevel[];
}

/**
 * Union type for all WebSocket events
 */
export type BinanceWSEvent = AccountUpdateEvent | OrderTradeUpdateEvent | TradeEvent | KlineEvent | DepthEvent | EtfRebalanceEvent;

/**
 * Base error for Binance operations
 */
export class BinanceError extends Error {
  readonly code?: number | string | undefined;
  readonly status?: number | undefined;

  constructor(message: string, code?: number | string | undefined, status?: number | undefined) {
    super(message);
    this.name = 'BinanceError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Authentication error (non-retryable)
 */
export class BinanceAuthenticationError extends BinanceError {
  constructor(message: string) {
    super(message, -1000, 401);
    this.name = 'BinanceAuthenticationError';
  }
}

/**
 * Rate limit error (retryable after weight reset)
 */
export class BinanceRateLimitError extends BinanceError {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number = 60000) {
    super(message, -1003, 429);
    this.name = 'BinanceRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Insufficient balance error (non-retryable)
 */
export class BinanceInsufficientBalanceError extends BinanceError {
  constructor(message: string) {
    super(message, -2010, 400);
    this.name = 'BinanceInsufficientBalanceError';
  }
}

/**
 * Invalid signature error (non-retryable)
 */
export class BinanceInvalidSignatureError extends BinanceError {
  constructor(message: string) {
    super(message, -1022, 400);
    this.name = 'BinanceInvalidSignatureError';
  }
}

/**
 * Order reject error (non-retryable for same params)
 */
export class BinanceOrderRejectedError extends BinanceError {
  constructor(message: string) {
    super(message, -2010, 400);
    this.name = 'BinanceOrderRejectedError';
  }
}

/**
 * Spot adapter configuration
 */
export interface BinanceSpotConfig {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
  recvWindow?: number;
  enableMetrics?: boolean;
  apiUrl?: string;
}

/**
 * WebSocket configuration
 */
export interface BinanceWebSocketConfig {
  wsUrl?: string;
  pingInterval?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
}

/**
 * Adapter options combining config + wsConfig
 */
export interface BinanceSpotAdapterOptions {
  config: BinanceSpotConfig;
  wsConfig?: BinanceWebSocketConfig;
}

/**
 * Rate limit information from Binance exchange info
 */
export interface RateLimit {
  readonly rateLimitType: 'REQUEST_WEIGHT' | 'ORDERS' | 'RAW_REQUESTS';
  readonly interval: string;
  readonly intervalNum: number;
  readonly limit: number;
}

/**
 * Symbol filter (LOT_SIZE, MIN_NOTIONAL, etc.)
 */
export interface SymbolFilter {
  readonly filterType: 'PRICE_FILTER' | 'LOT_SIZE' | 'MIN_NOTIONAL' | 'PERCENT_PRICE' | 'MAX_NUM_ORDERS' | 'MAX_ALGO_ORDERS';
  readonly minPrice?: string;
  readonly maxPrice?: string;
  readonly tickSize?: string;
  readonly minQty?: string;
  readonly maxQty?: string;
  readonly stepSize?: string;
  readonly minNotional?: string;
  readonly maxNumOrders?: number;
  readonly maxAlgoOrders?: number;
  readonly multiplierUp?: string;
  readonly multiplierDown?: string;
  readonly avgPriceMins?: number;
}
