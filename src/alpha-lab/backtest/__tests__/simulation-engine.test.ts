import { BacktestEngine } from '../simulation-engine';
import { Tick } from '@shared/types/market-data';

describe('BacktestEngine', () => {
    it('should process ticks and calculate PnL with slippage', async () => {
        const ticks: Tick[] = [
            { id: '1', price: 100, timestamp: 1000, volume: 10 },
            { id: '2', price: 105, timestamp: 2000, volume: 10 }
        ];

        const engine = new BacktestEngine(ticks, { dailyVolume: 1000 });
        const result = await engine.run((tick) => tick.price === 100 ? 1 : -1);

        expect(result.ticksProcessed).toBe(2);
        // Trade 1: Buy @ 100 + slippage. Trade 2: Sell @ 105 - slippage.
        expect(result.pnl).not.toBe(0);
    });

    it('should sort ticks by timestamp', async () => {
        const ticks: Tick[] = [
            { id: '2', price: 101, timestamp: 200 },
            { id: '1', price: 100, timestamp: 100 }
        ];
        const engine = new BacktestEngine(ticks, { dailyVolume: 1000 });
        // @ts-ignore - access private property for verification
        expect(engine.ticks[0].id).toBe('1');
    });
});
