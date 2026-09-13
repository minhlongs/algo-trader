/**
 * Binance WebSocket Client
 * WebSocket streams for orderbook, trades, and ticker data
 * Docs: https://binance-docs.github.io/apidocs/spot/en/#websocket-market-streams
 *
 * Decomposed into modular submodules. Re-exports 100% public contracts.
 */

export * from './binance-ws-types';
export { BinanceWebSocketClient } from './binance-ws-client';
export { normalizeSymbol } from './binance-ws-parsers';
