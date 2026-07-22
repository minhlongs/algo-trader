#!/usr/bin/env node
/**
 * Test script to verify TradingEventBus and OrderBookStream integration.
 *
 * This script:
 * 1. Initializes the TradingEventBus singleton
 * 2. Subscribes to PRICE_UPDATE events
 * 3. Creates an OrderBookStream connected to the event bus
 * 4. Subscribes to a test token ID (or mock one)
 * 5. Verifies PRICE_UPDATE events are emitted
 *
 * Usage: npx tsx scripts/test-event-bus-integration.ts
 */

import { tradingEventBus } from '../src/desk/events/trading-event-bus';
import { OrderBookStream } from '../src/desk/polymarket/orderbook-stream';
import { logger } from '../src/shared/utils/logger';

// Test token IDs (YES/NO tokens for a known Polymarket market)
// These are real token IDs from the Gamma API for an active market
const TEST_TOKEN_IDS = [
  '98022490269692409998126496127597032490334070080325855126491859374983463996227', // YES token
  '53831553061883006530739877284105938919721408776239639687877978808906551086026', // NO token
];

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest(): Promise<void> {
  logger.info('=== TradingEventBus Integration Test ===');

  let priceUpdateCount = 0;
  const receivedTokenIds = new Set<string>();

  // 1. Subscribe to PRICE_UPDATE events on the event bus
  const cleanupPriceUpdate = tradingEventBus.onPriceUpdate((payload) => {
    priceUpdateCount++;
    receivedTokenIds.add(payload.tokenId);
    logger.info('✅ PRICE_UPDATE received', {
      tokenId: payload.tokenId.slice(0, 10) + '...',
      bid: payload.bid,
      ask: payload.ask,
      spreadBps: payload.spreadBps?.toFixed(2),
      timestamp: new Date(payload.timestamp).toISOString(),
    });
  });

  // 2. Subscribe to CONNECTION_STATUS events
  const cleanupConnectionStatus = tradingEventBus.onConnectionStatus((payload) => {
    logger.info('📡 CONNECTION_STATUS', {
      component: payload.component,
      status: payload.status,
      retryAttempt: payload.retryAttempt,
      nextRetryMs: payload.nextRetryMs,
      error: payload.error,
    });
  });

  // 3. Subscribe to SYSTEM_ALERT events
  const cleanupSystemAlert = tradingEventBus.onSystemAlert((payload) => {
    logger.warn('⚠️ SYSTEM_ALERT', {
      level: payload.level,
      component: payload.component,
      message: payload.message,
    });
  });

  // 4. Create OrderBookStream with the event bus
  const orderBookStream = new OrderBookStream(tradingEventBus);

  // 5. Subscribe to test token IDs
  logger.info('Subscribing to test tokens...', { tokens: TEST_TOKEN_IDS.length });
  for (const tokenId of TEST_TOKEN_IDS) {
    orderBookStream.subscribe(tokenId);
  }

  // 6. Connect to WebSocket
  logger.info('Connecting to Polymarket CLOB WebSocket...');
  orderBookStream.connect();

  // 7. Wait for connection and events
  logger.info('Waiting for connection and price updates (30 seconds)...');

  let connectionEstablished = false;
  let testPassed = false;

  const connectionCleanup = tradingEventBus.onConnectionStatus((payload) => {
    if (payload.component === 'OrderBookStream' && payload.status === 'connected') {
      connectionEstablished = true;
    }
  });

  // Wait for connection
  let waitTime = 0;
  const maxWaitMs = 15000;
  const pollIntervalMs = 500;

  while (waitTime < maxWaitMs && !connectionEstablished) {
    await sleep(pollIntervalMs);
    waitTime += pollIntervalMs;
  }

  if (!connectionEstablished) {
    logger.error('❌ Connection to Polymarket WebSocket timed out');
    // Still check if we got any events
  } else {
    logger.info('✅ WebSocket connected successfully');
  }

  // Wait for price updates
  const startTime = Date.now();
  const testDurationMs = 30000; // 30 seconds

  while (Date.now() - startTime < testDurationMs) {
    await sleep(2000);

    // Check if we're receiving updates
    if (priceUpdateCount > 0) {
      testPassed = true;
      logger.info(`📊 Received ${priceUpdateCount} price updates for ${receivedTokenIds.size} tokens`);
    }

    // Log connection status
    const status = tradingEventBus.getConnectionStatus('OrderBookStream');
    if (status) {
      logger.debug('Connection status', { status: status.status, retryAttempt: status.retryAttempt });
    }
  }

  // 8. Cleanup
  logger.info('Shutting down test...');
  orderBookStream.disconnect();
  cleanupPriceUpdate();
  cleanupConnectionStatus();
  cleanupSystemAlert();
  connectionCleanup();

  // 9. Report results
  logger.info('=== Test Results ===');
  logger.info(`Connection established: ${connectionEstablished ? '✅ PASS' : '❌ FAIL'}`);
  logger.info(`Price updates received: ${priceUpdateCount} ${priceUpdateCount > 0 ? '✅ PASS' : '❌ FAIL'}`);
  logger.info(`Unique tokens with updates: ${receivedTokenIds.size}`);
  logger.info(`Test passed: ${testPassed && connectionEstablished ? '✅ YES' : '❌ NO'}`);

  if (!testPassed || !connectionEstablished) {
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, exiting...');
  process.exit(0);
});

runTest().catch(err => {
  logger.error('Test failed with error', { err: String(err) });
  process.exit(1);
});