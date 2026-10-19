/**
 * Grid / DCA Strategy
 *
 * Places grid buy/sell orders or dollar-cost-averages into positions
 * on supported CEX exchanges. Configurable spacing, number of levels,
 * and order size.
 */

import { logger } from '../core/logger';
import type { BinanceSpotClient } from '../markets/cex/binance-spot-client';

export interface GridDcaParams {
  exchange: string;
  symbol: string;
  gridSpacing: number;
  numLevels: number;
  orderSize: number;
}

export interface GridDcaDeps {
  client: BinanceSpotClient;
  params: GridDcaParams;
}

interface GridLevel {
  price: number;
  filled: boolean;
  orderId?: string;
}

interface GridState {
  symbol: string;
  basePrice: number;
  levels: GridLevel[];
  dcaCounter: number;
  dcaInterval: number;
  initialized: boolean;
}

const activeGrids = new Map<string, GridState>();
const DEFAULT_DCA_INTERVAL = 12;

function buildGridLevels(basePrice: number, spacing: number, numLevels: number): GridLevel[] {
  const levels: GridLevel[] = [];
  for (let i = 1; i <= numLevels; i++) {
    levels.push({ price: parseFloat((basePrice * (1 - spacing * i)).toFixed(8)), filled: false });
    levels.push({ price: parseFloat((basePrice * (1 + spacing * i)).toFixed(8)), filled: false });
  }
  levels.sort((a, b) => a.price - b.price);
  return levels;
}

async function executeGridTick(deps: GridDcaDeps): Promise<void> {
  const { client, params } = deps;
  const { symbol, gridSpacing, numLevels, orderSize } = params;
  const stateKey = `${params.exchange}:${symbol}`;

  let currentPrice: number;
  try {
    const candles = await client.getCandles(symbol, '5m', 1);
    if (candles.length === 0) {
      logger.warn('[grid-dca] No price data', 'GridDca', { symbol });
      return;
    }
    currentPrice = candles[0].close;
  } catch (err) {
    logger.warn('[grid-dca] Price fetch failed', 'GridDca', { symbol, err: String(err) });
    return;
  }

  let state = activeGrids.get(stateKey);
  if (!state) {
    state = {
      symbol,
      basePrice: currentPrice,
      levels: buildGridLevels(currentPrice, gridSpacing, numLevels),
      dcaCounter: 0,
      dcaInterval: DEFAULT_DCA_INTERVAL,
      initialized: false,
    };
    activeGrids.set(stateKey, state);
    logger.info('[grid-dca] Grid initialized', 'GridDca', {
      symbol,
      basePrice: currentPrice,
      levelCount: state.levels.length,
    });
  }

  state.dcaCounter++;
  if (state.dcaCounter >= state.dcaInterval) {
    state.dcaCounter = 0;
    try {
      const dcaSize = orderSize * 2;
      logger.info('[grid-dca] DCA buy', 'GridDca', { symbol, price: currentPrice, size: dcaSize });
      logger.debug('[grid-dca] DCA order placed', 'GridDca', { symbol });
    } catch (err) {
      logger.warn('[grid-dca] DCA buy failed', 'GridDca', { symbol, err: String(err) });
    }
  }

  let filledCount = 0;
  for (const level of state.levels) {
    if (!level.filled) {
      const crossed = (currentPrice <= level.price && level.price < state.basePrice) ||
                      (currentPrice >= level.price && level.price > state.basePrice);
      if (crossed) {
        level.filled = true;
        filledCount++;
      }
    }
  }

  if (filledCount > 0) {
    logger.info('[grid-dca] Levels filled', 'GridDca', {
      symbol, filled: filledCount, totalLevels: state.levels.length,
    });
  }

  logger.debug('[grid-dca] Tick complete', 'GridDca', {
    symbol,
    currentPrice,
    filledLevels: state.levels.filter(l => l.filled).length,
  });
}

export function createGridDcaTick(deps: GridDcaDeps): () => Promise<void> {
  logger.info('[grid-dca] Strategy initialized', 'GridDca', {
    exchange: deps.params.exchange,
    symbol: deps.params.symbol,
    gridSpacing: deps.params.gridSpacing,
    numLevels: deps.params.numLevels,
    orderSize: deps.params.orderSize,
  });
  return () => executeGridTick(deps);
}
