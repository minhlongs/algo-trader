/**
 * Strategy wiring — registers strategy tick functions with StrategyOrchestrator.
 * Pure orchestration: creates tick factories and wires them into the orchestrator.
 */
import { StrategyOrchestrator } from '../strategies/strategy-orchestrator';
import { createPolymarketArbTick } from '../strategies/polymarket-arb-strategy';
import { createGridDcaTick } from '../strategies/grid-dca-strategy';
import type { MarketScanner } from '../polymarket/market-scanner';
import type { OrderManager } from '../polymarket/order-manager';
import type { OrderExecutor } from '../cex/order-executor';
import type { ExchangeClient } from '../cex/exchange-client';
import type { EventBus } from '../events/event-bus';
import type { GammaClient } from '../polymarket/gamma-client';
import type { ClobClient } from '../polymarket/clob-client';
import { startNatsEventLoop, type NatsEventLoop } from './nats-event-loop';
import {
  ENABLED_IDS,
  env,
  POLY_STRATEGIES,
  registerPolymarketStrategies,
  type PolyStrategyDescriptor,
  type StrategyFactory,
} from './strategy-wiring-registry';

export {
  ENABLED_IDS,
  env,
  POLY_STRATEGIES,
  registerPolymarketStrategies,
  type PolyStrategyDescriptor,
  type StrategyFactory,
} from './strategy-wiring-registry';

export interface WireStrategyDeps {
  eventBus: EventBus;
  scanner?: MarketScanner;
  orderManager?: OrderManager;
  cexExecutor?: OrderExecutor;
  cexClient?: ExchangeClient;
  clobClient?: ClobClient;
  gammaClient?: GammaClient;
}

/** Wire all strategy factories into a new StrategyOrchestrator. */
export function wireStrategies(deps: WireStrategyDeps): StrategyOrchestrator {
  const { eventBus, scanner, orderManager, cexExecutor, cexClient, clobClient, gammaClient } = deps;
  const orc = new StrategyOrchestrator(eventBus);

  if (scanner && orderManager) {
    orc.register(
      { id: 'polymarket-arb', name: 'Polymarket Arbitrage', type: 'polymarket-arb', enabled: true, params: {}, intervalMs: parseInt(env('POLYMARKET_ARB_INTERVAL_MS', '30000'), 10) },
      createPolymarketArbTick({ scanner, orderManager, eventBus }),
    );
  }

  if (clobClient && orderManager && gammaClient) {
    registerPolymarketStrategies(orc, { clob: clobClient, orderManager, eventBus, gamma: gammaClient });
  }

  if (cexExecutor && cexClient) {
    orc.register(
      { id: 'grid-dca', name: 'Grid / DCA', type: 'grid', enabled: false, params: {}, intervalMs: parseInt(env('GRID_DCA_INTERVAL_MS', '60000'), 10) },
      createGridDcaTick({
        executor: cexExecutor, client: cexClient, eventBus,
        params: {
          exchange: 'binance',
          symbol: env('GRID_SYMBOL', 'BTC/USDT'),
          gridSpacing: parseFloat(env('GRID_SPACING', '0.01')),
          numLevels: parseInt(env('GRID_LEVELS', '5'), 10),
          orderSize: parseFloat(env('GRID_ORDER_SIZE', '0.001')),
        },
      }),
    );
  }

  return orc;
}

export async function wireStrategiesWithNats(
  deps: WireStrategyDeps,
): Promise<{ orc: StrategyOrchestrator; eventLoop: NatsEventLoop }> {
  const orc = wireStrategies(deps);
  const eventLoop = await startNatsEventLoop();
  return { orc, eventLoop };
}
