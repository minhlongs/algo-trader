/**
 * Binance Spot REST API Adapter
 * Wraps Binance Spot API with typed methods and enhanced error handling.
 * Docs: https://binance-docs.github.io/apidocs/spot/en/
 *
 * Features:
 * - Order management (place, cancel, query)
 * - Margin trading support (cross/isolated)
 * - ETF trading support (leveraged tokens)
 * - Multi-asset margin (cross-collateral)
 * - Market data (ticker, orderbook, candles)
 * - Retry logic with exponential backoff
 * - Prometheus metrics integration
 *
 * Auth: BINANCE_API_KEY, BINANCE_SECRET from process.env
 */

import { EventEmitter } from 'events';
import { createHmac } from 'crypto';
import { recordExternalApiLatency } from '../middleware/prometheus-metrics';
import { Http2ConnectionPool } from './http2-connection-pool';
import * as http2 from 'node:http2';
import { logger } from '../utils/logger';
import {
  BinanceOrder,
  BinanceOrderSide,
  BinanceOrderType,
  BinanceTimeInForce,
  PlaceSpotOrderRequest,
  PlaceMarginOrderRequest,
  SpotBalance,
  MarginBalance,
  AccountInfo,
  OrderBook,
  Binance24hTicker,
  SymbolInfo,
  SymbolFilter,
  LeveragedEtfInfo,
  CrossCollateralData,
  BinanceSpotAdapterOptions,
  BinanceSpotConfig,
  BinanceError,
  BinanceRateLimitError,
  BinanceAuthenticationError,
  BinanceInsufficientBalanceError,
  BinanceInvalidSignatureError,
  BinanceOrderRejectedError,
  BinanceOrderStatus,
  RateLimit,
  OrderBookLevel,
  Trade,
  Kline,
} from './binance-spot-types';

const SPOT_API_URL = 'https://api.binance.com';
const TESTNET_API_URL = 'https://testnet.binance.vision';

export class BinanceSpotAdapter extends EventEmitter {
  private readonly config: BinanceSpotConfig;
  private readonly apiUrl: string;
  private readonly http2Pool: Http2ConnectionPool;
  private readonly enableMetrics: boolean;
  private readonly MAX_LEVERAGE: number;
  private readonly MIN_LEVERAGE: number;
  private readonly DEFAULT_RECV_WINDOW: number;
  private exchangeInfoCache?: {
    symbols: SymbolInfo[];
    rateLimits: RateLimit[];
    cachedAt: number;
  };
  private readonly EXCHANGE_INFO_TTL: number;

  constructor(options: BinanceSpotAdapterOptions) {
    super();
    this.config = options.config;
    this.apiUrl = options.config.apiUrl || (options.config.testnet ? TESTNET_API_URL : SPOT_API_URL);
    this.http2Pool = Http2ConnectionPool.getInstance();
    this.enableMetrics = options.config.enableMetrics !== false;
    this.MAX_LEVERAGE = 125; // Binance max leverage for futures, spot is lower (typically 3-5x for margin)
    this.MIN_LEVERAGE = 1;
    this.DEFAULT_RECV_WINDOW = options.config.recvWindow || 5000;
    this.EXCHANGE_INFO_TTL = 5 * 60 * 1000; // 5 minutes

    this.warmPool().catch((err) => {
      logger.warn('Failed to warm HTTP/2 pool', { error: err instanceof Error ? err.message : String(err) });
    });
  }

  /**
   * Pre-warm the connection pool for faster first requests
   */
  private async warmPool(): Promise<void> {
    try {
      await this.http2Pool.warmConnections(this.apiUrl, 3);
    } catch (err) {
      logger.warn('Pool warming failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Generate HMAC-SHA256 signature for API requests
   * Binance uses timestamp + recvWindow in signature
   */
  private signMessage(timestamp: string, recvWindow?: number): string {
    const message = timestamp + (recvWindow?.toString() || this.DEFAULT_RECV_WINDOW.toString());
    return createHmac('sha256', this.config.apiSecret).update(message).digest('hex');
  }

  /**
   * Get current timestamp in milliseconds
   */
  private getTimestamp(): string {
    return Math.floor(Date.now() / 1000).toString();
  }

  /**
   * Make an authenticated HTTP/2 request to Binance API
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PUT',
    endpoint: string,
    queryParams?: Record<string, string>,
    body?: Record<string, unknown>
  ): Promise<T> {
    const startTime = Date.now();
    let session: http2.ClientHttp2Session | null = null;

    try {
      // Build URL with query params
      const url = new URL(this.apiUrl + endpoint);
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      // Authentication headers
      const timestamp = this.getTimestamp();
      const signature = this.signMessage(timestamp, queryParams?.recvWindow ? Number(queryParams.recvWindow) : undefined);
      const headers = {
        'Content-Type': 'application/json',
        'X-MBX-APIKEY': this.config.apiKey,
        'X-MBX-TIMESTAMP': timestamp,
        'X-MBX-RECVWINDOW': (queryParams?.recvWindow || this.DEFAULT_RECV_WINDOW).toString(),
        'X-MBX-SIGNATURE': signature,
      };

      // Acquire session from pool
      session = await this.http2Pool.getSession(this.apiUrl);

      // Build HTTP/2 request with pseudo-headers and wrap in Promise
      return await new Promise<T>((resolve, reject) => {
        const reqStream = session!.request({
          ':method': method,
          ':path': url.pathname + url.search,
          ...headers, // spread additional headers (Content-Type, X-MBX-*, etc.)
        });

        let responseData = '';

        reqStream.on('response', (headers) => {
          const status = headers[':status'] as number;

          // Handle error responses
          if (status < 200 || status >= 300) {
            let errorBody = '';
            reqStream.on('data', (chunk) => {
              errorBody += chunk.toString();
            });
            reqStream.on('end', async () => {
              try {
                const errorJson = JSON.parse(errorBody);
                const binanceError = this.normalizeError(errorJson, status);
                if (this.enableMetrics) {
                  recordExternalApiLatency('binance_spot', endpoint, 'unknown', (Date.now() - startTime) / 1000);
                }
                reject(binanceError);
              } catch {
                reject(new BinanceError(`HTTP ${status}: ${errorBody}`, undefined, status));
              }
            });
            return;
          }

          // Success response
          reqStream.on('data', (chunk) => {
            responseData += chunk;
          });

          reqStream.on('end', () => {
            try {
              const parsed = JSON.parse(responseData) as T;
              if (this.enableMetrics) {
                recordExternalApiLatency('binance_spot', endpoint, 'unknown', (Date.now() - startTime) / 1000);
              }
              resolve(parsed);
            } catch (parseErr) {
              reject(new BinanceError(`Failed to parse response: ${parseErr}`));
            }
          });
        });

        reqStream.on('error', (err: Error) => {
          reject(new BinanceError(`HTTP/2 stream error: ${err.message}`));
        });

        // Write body if present
        if (body && (method === 'POST' || method === 'PUT')) {
          reqStream.write(JSON.stringify(body));
        }

        reqStream.end();
      });
    } catch (error) {
      if (this.enableMetrics) {
        recordExternalApiLatency('binance_spot', endpoint, 'unknown', (Date.now() - startTime) / 1000);
      }
      throw error;
    } finally {
      if (session) {
        this.http2Pool.releaseSession(this.apiUrl, session);
      }
    }
  }

  /**
   * Normalize Binance API error into typed error classes
   */
  private normalizeError(error: Record<string, unknown>, status?: number): BinanceError {
    const code = error.code as number | string | undefined;
    const msg = error.msg as string || error.message as string || 'Unknown Binance API error';

    // Normalize code to number for comparison (if defined)
    const numericCode = code != null ? Number(code) : NaN;

    // Authentication errors
    if (numericCode === -1000 || numericCode === -1001 || status === 401) {
      return new BinanceAuthenticationError(msg);
    }

    // Invalid signature
    if (numericCode === -1022) {
      return new BinanceInvalidSignatureError(msg);
    }

    // Rate limit
    if (numericCode === -1003 || numericCode === 429) {
      const retryAfter = error.retryAfterMs as number || 60000;
      return new BinanceRateLimitError(msg, retryAfter);
    }

    // Insufficient balance
    if (numericCode === -2010) {
      return new BinanceInsufficientBalanceError(msg);
    }

    // Order rejected
    if (numericCode === -2010 || numericCode === -2011 || numericCode === -1015) {
      return new BinanceOrderRejectedError(msg);
    }

    return new BinanceError(msg, code);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    return error instanceof BinanceRateLimitError || (error instanceof BinanceError && error.status === 502);
  }

  /**
   * Normalize Binance order to our interface
   */
  private normalizeOrder(order: Record<string, unknown>): BinanceOrder {
    return {
      symbol: order.s as string,
      orderId: Number(order.i),
      clientOrderId: order.c as string,
      side: order.S as BinanceOrderSide,
      type: order.o as BinanceOrderType,
      price: order.p as string,
      origQty: order.q as string,
      executedQty: order.z as string,
      cummulativeQuoteQty: order.Z as string,
      status: order.X as BinanceOrderStatus,
      timeInForce: order.f as BinanceTimeInForce,
      stopPrice: order.stopPrice ? String(order.stopPrice) : undefined,
      icebergQty: order.icebergQty ? String(order.icebergQty) : undefined,
      avgPrice: order.ap ? String(order.ap) : undefined,
      origType: order.origType ? (order.origType as BinanceOrderType) : undefined,
      updateTime: Number(order.u),
      isWorking: Boolean(order.working),
      marginBuyBorrowAmount: order.marginBuyBorrowAmount ? String(order.marginBuyBorrowAmount) : undefined,
      marginBuyBorrowAsset: order.marginBuyBorrowAsset ? String(order.marginBuyBorrowAsset) : undefined,
      selfTradePreventionMode: order.selfTradePreventionMode ? String(order.selfTradePreventionMode) : undefined,
    };
  }

  /**
   * Normalize order status from Binance format
   */
  private normalizeOrderStatus(status: string): BinanceOrderStatus {
    return status as BinanceOrderStatus;
  }

  /**
   * Check if error indicates order not found
   */
  private isOrderNotFoundError(error: unknown): boolean {
    return error instanceof BinanceError && error.code != null && Number(error.code) === -2011;
  }

  /**
   * Validate place order request against symbol info
   */
  private validatePlaceOrderRequest(_req: PlaceSpotOrderRequest | PlaceMarginOrderRequest): void {
    // TODO: Validate against symbol filters (minQty, maxQty, stepSize, minNotional)
    // This requires fetching exchange info first
  }

  /**
   * Get region for metrics (from env or default)
   */
  private getRegion(): string {
    return process.env.REGION || 'unknown';
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Public API Methods ─────────────────────────────────────────────────────

  /**
   * Fetch spot account balances
   */
  async fetchBalances(): Promise<SpotBalance[]> {
    const response = await this.request<{ balances: Array<{ asset: string; free: string; locked: string }> }>(
      'GET',
      '/api/v3/account'
    );
    return response.balances;
  }

  /**
   * Fetch single asset balance
   */
  async fetchBalance(asset: string): Promise<SpotBalance> {
    const balances = await this.fetchBalances();
    const balance = balances.find((b) => b.asset === asset);
    if (!balance) {
      throw new BinanceError(`Balance not found for asset ${asset}`);
    }
    return balance;
  }

  /**
   * Fetch detailed account info (fees, permissions)
   */
  async fetchAccountInfo(): Promise<AccountInfo> {
    const response = await this.request<{
      makerCommission: number;
      takerCommission: number;
      buyerCommission: number;
      sellerCommission: number;
      canTrade: boolean;
      canWithdraw: boolean;
      canDeposit: boolean;
      updateTime: number;
      accountType: string;
      balances: Array<{ asset: string; free: string; locked: string }>;
      permissions: string[];
    }>('GET', '/api/v3/account');
    return {
      ...response,
      balances: response.balances as SpotBalance[],
      accountType: response.accountType as 'SPOT' | 'MARGIN' | 'ISOLATED_MARGIN',
    };
  }

  /**
   * Fetch margin account balances (if margin enabled)
   */
  async fetchMarginBalances(): Promise<MarginBalance[]> {
    const response = await this.request<{ assets: MarginBalance[] }>('GET', '/sapi/v1/margin/account');
    return response.assets;
  }

  /**
   * Get cross-collateral (multi-asset margin) data
   */
  async fetchCrossCollateralData(): Promise<CrossCollateralData> {
    const response = await this.request<CrossCollateralData>('GET', '/sapi/v1/margin/crossCollateralData');
    return response;
  }

  /**
   * Place a new spot order
   */
  async placeOrder(req: PlaceSpotOrderRequest): Promise<BinanceOrder> {
    this.validatePlaceOrderRequest(req);

    const params: Record<string, string> = {
      symbol: req.symbol,
      side: req.side,
      type: req.type,
      quantity: req.quantity,
    };

    if (req.price) params.price = req.price;
    if (req.timeInForce) params.timeInForce = req.timeInForce;
    if (req.stopPrice) params.stopPrice = req.stopPrice;
    if (req.stopLimitPrice) params.stopLimitPrice = req.stopLimitPrice;
    if (req.stopLimitTimeInForce) params.stopLimitTimeInForce = req.stopLimitTimeInForce;
    if (req.icebergQty) params.icebergQty = req.icebergQty;
    if (req.newOrderRespType) params.newOrderRespType = req.newOrderRespType;
    if (req.quoteOrderQty) params.quoteOrderQty = req.quoteOrderQty;
    if (req.clientOrderId) params.newClientOrderId = req.clientOrderId;
    if (req.recvWindow) params.recvWindow = req.recvWindow.toString();

    const response = await this.request<Record<string, unknown>>('POST', '/api/v3/order', params);
    return this.normalizeOrder(response);
  }

  /**
   * Place margin order (allows borrowing)
   */
  async placeMarginOrder(req: PlaceMarginOrderRequest): Promise<BinanceOrder> {
    const params: Record<string, string> = {
      symbol: req.symbol,
      side: req.side,
      type: req.type,
      quantity: req.quantity,
    };

    if (req.price) params.price = req.price;
    if (req.timeInForce) params.timeInForce = req.timeInForce;
    if (req.isIsolated) params.isIsolated = 'TRUE';
    if (req.sideEffectType) params.sideEffectType = req.sideEffectType;
    if (req.stopPrice) params.stopPrice = req.stopPrice;
    if (req.stopLimitPrice) params.stopLimitPrice = req.stopLimitPrice;
    if (req.stopLimitTimeInForce) params.stopLimitTimeInForce = req.stopLimitTimeInForce;
    if (req.icebergQty) params.icebergQty = req.icebergQty;
    if (req.newOrderRespType) params.newOrderRespType = req.newOrderRespType;
    if (req.quoteOrderQty) params.quoteOrderQty = req.quoteOrderQty;
    if (req.clientOrderId) params.newClientOrderId = req.clientOrderId;
    if (req.recvWindow) params.recvWindow = req.recvWindow.toString();

    const response = await this.request<Record<string, unknown>>('POST', '/sapi/v1/margin/order', params);
    return this.normalizeOrder(response);
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, symbol: string, clientOrderId?: string): Promise<{ canceled: boolean }> {
    const params: Record<string, string> = {
      symbol,
      orderId,
    };
    if (clientOrderId) params.origClientOrderId = clientOrderId;

    try {
      await this.request<Record<string, unknown>>('DELETE', '/api/v3/order', params);
      return { canceled: true };
    } catch (error) {
      if (this.isOrderNotFoundError(error)) {
        return { canceled: false };
      }
      throw error;
    }
  }

  /**
   * Fetch order by ID
   */
  async fetchOrder(orderId: string, symbol: string, clientOrderId?: string): Promise<BinanceOrder | null> {
    const params: Record<string, string> = {
      symbol,
      orderId,
    };
    if (clientOrderId) params.origClientOrderId = clientOrderId;

    try {
      const response = await this.request<Record<string, unknown>>('GET', '/api/v3/order', params);
      return this.normalizeOrder(response);
    } catch (error) {
      if (this.isOrderNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Fetch all open orders (optionally filtered by symbol)
   */
  async fetchOpenOrders(symbol?: string): Promise<BinanceOrder[]> {
    const params: Record<string, string> = {};
    if (symbol) params.symbol = symbol;

    const response = await this.request<Record<string, unknown>[]>('GET', '/api/v3/openOrders', params);
    return response.map((order) => this.normalizeOrder(order));
  }

  /**
   * Fetch all orders (with pagination)
   */
  async fetchOrders(
    symbol: string,
    limit: number = 500,
    startTime?: number,
    endTime?: number
  ): Promise<BinanceOrder[]> {
    const params: Record<string, string> = {
      symbol,
      limit: limit.toString(),
    };
    if (startTime) params.startTime = startTime.toString();
    if (endTime) params.endTime = endTime.toString();

    const response = await this.request<Record<string, unknown>[]>('GET', '/api/v3/allOrders', params);
    return response.map((order) => this.normalizeOrder(order));
  }

  /**
   * Fetch 24hr ticker
   */
  async fetchTicker(symbol: string): Promise<Binance24hTicker> {
    const response = await this.request<Binance24hTicker>('GET', '/api/v3/ticker/24hr', { symbol });
    return response;
  }

  /**
   * Fetch order book
   */
  async fetchOrderBook(symbol: string, limit: number = 100): Promise<OrderBook> {
    const response = await this.request<{
      lastUpdateId: number;
      bids: [string, string][];
      asks: [string, string][];
    }>('GET', '/api/v3/depth', { symbol, limit: limit.toString() });

    return {
      lastUpdateId: response.lastUpdateId,
      bids: response.bids.map(([price, qty]) => ({ price, quantity: qty })) as OrderBookLevel[],
      asks: response.asks.map(([price, qty]) => ({ price, quantity: qty })) as OrderBookLevel[],
      symbol,
    };
  }

  /**
   * Fetch recent trades
   */
  async fetchTrades(symbol: string, limit: number = 500): Promise<Trade[]> {
    const response = await this.request<Trade[]>('GET', '/api/v3/trades', { symbol, limit: limit.toString() });
    return response;
  }

  /**
   * Fetch OHLCV candles
   */
  async fetchOHLCV(
    symbol: string,
    timeframe: string = '1m',
    limit: number = 500,
    startTime?: number,
    endTime?: number
  ): Promise<number[][]> {
    const params: Record<string, string> = {
      symbol,
      interval: timeframe,
      limit: limit.toString(),
    };
    if (startTime) params.startTime = startTime.toString();
    if (endTime) params.endTime = endTime.toString();

    const response = await this.request<Kline[]>('GET', '/api/v3/klines', params);
    return response.map((k) => [
      k.openTime,
      parseFloat(k.open),
      parseFloat(k.high),
      parseFloat(k.low),
      parseFloat(k.close),
      parseFloat(k.volume),
    ]) as number[][];
  }

  /**
   * Fetch leveraged ETF info
   */
  async fetchEtfInfo(symbol?: string): Promise<LeveragedEtfInfo[]> {
    const params: Record<string, string> = {};
    if (symbol) params.symbol = symbol;

    const response = await this.request<LeveragedEtfInfo[]>('GET', '/sapi/v1/etf/leverage', params);
    return response;
  }

  /**
   * Fetch exchange symbols info (cached)
   */
  async fetchExchangeInfo(): Promise<{ symbols: SymbolInfo[]; rateLimits: RateLimit[] }> {
    const now = Date.now();
    if (this.exchangeInfoCache && now - this.exchangeInfoCache.cachedAt < this.EXCHANGE_INFO_TTL) {
      return {
        symbols: this.exchangeInfoCache.symbols,
        rateLimits: this.exchangeInfoCache.rateLimits,
      };
    }

    const response = await this.request<{
      symbols: (SymbolInfo & { filters: SymbolFilter[]; permissions: string[] })[];
      rateLimits: RateLimit[];
    }>('GET', '/api/v3/exchangeInfo');

    const symbols: SymbolInfo[] = response.symbols.map((s) => ({
      symbol: s.symbol,
      status: s.status,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      baseAssetPrecision: s.baseAssetPrecision,
      quoteAssetPrecision: s.quoteAssetPrecision,
      quotePrecision: s.quotePrecision,
      orderTypes: s.orderTypes,
      icebergAllowed: s.icebergAllowed,
      ocoAllowed: s.ocoAllowed,
      otcAllowed: s.otcAllowed,
      isSpotTradingAllowed: s.isSpotTradingAllowed,
      isMarginTradingAllowed: s.isMarginTradingAllowed,
      pricePrecision: s.pricePrecision,
      quantityPrecision: s.quantityPrecision,
      minQty: s.filters.find((f) => f.filterType === 'LOT_SIZE')?.minQty || '0',
      maxQty: s.filters.find((f) => f.filterType === 'LOT_SIZE')?.maxQty || '0',
      minNotional: s.filters.find((f) => f.filterType === 'MIN_NOTIONAL')?.minNotional || '0',
      stepSize: s.filters.find((f) => f.filterType === 'LOT_SIZE')?.stepSize || '0',
      tickSize: s.filters.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize || '0',
    }));

    this.exchangeInfoCache = {
      symbols,
      rateLimits: response.rateLimits,
      cachedAt: now,
    };

    return { symbols, rateLimits: response.rateLimits };
  }

  /**
   * Get symbol info from cache or fetch
   */
  async getSymbolInfo(symbol: string): Promise<SymbolInfo | null> {
    const { symbols } = await this.fetchExchangeInfo();
    return symbols.find((s) => s.symbol === symbol) || null;
  }

  /**
   * Place ETF redemption (swap leveraged token for underlying)
   */
  async redeemEtf(
    symbol: string,
    quantity: string,
    redemptionType: 'ORIGINAL' | 'LEVERAGED' = 'ORIGINAL'
  ): Promise<unknown> {
    const params: Record<string, string> = {
      symbol,
      quantity,
      redemptionType,
    };

    const response = await this.request<Record<string, unknown>>('POST', '/sapi/v1/etf/redemption', params);
    return response;
  }

  /**
   * Close all connections and clean up resources
   */
  async close(): Promise<void> {
    await this.http2Pool.shutdown();
  }
}
