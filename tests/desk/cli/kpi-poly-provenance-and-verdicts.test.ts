import { describe, expect, it } from 'vitest';
import { simulateMarketRegimeTick } from '../../../src/desk/backtesting/backtest-price-regimes';
import {
  estimateClusterDeployableCapacity,
  isExcludedFiveMinuteContract,
} from '../../../src/desk/cli/kpi-poly-book-metrics';
import { evaluatePolymarketKpis } from '../../../src/desk/cli/kpi-poly-evaluators';
import { KpiProvenanceError } from '../../../src/desk/cli/kpi-poly-source-guard';
import type { KpiEvaluationInput } from '../../../src/desk/cli/kpi-poly-types';
import { replayRows } from '../../../src/desk/polymarket/l2/l2-replay';
import { L2_SOURCE_RECORDED } from '../../../src/desk/polymarket/l2/l2-source-labels';
import { buildAllGoKpiInput, buildSampleGammaMarket } from './kpi-poly-fixtures';

describe('Polymarket KPI Provenance Gate & Microstructure Helpers', () => {
  it('rejects simulateMarketRegimeTick output (synthetic-regime) so it can never feed any KPI', () => {
    const base = buildAllGoKpiInput();
    const syntheticMarketTick = simulateMarketRegimeTick(buildSampleGammaMarket(), 5, 100, 0);
    expect(syntheticMarketTick.source).toBe('synthetic-regime');

    const poisoned: KpiEvaluationInput = {
      ...base,
      provenance: {
        ...base.provenance,
        snapshots: [
          {
            timestamp: '2026-11-12T00:00:00.000Z',
            source: 'prices-history',
            markets: [syntheticMarketTick],
          },
        ],
      },
    };

    expect(() => evaluatePolymarketKpis(poisoned)).toThrow(KpiProvenanceError);
    expect(() => evaluatePolymarketKpis(poisoned)).toThrow(/synthetic-regime/);
  });

  it('rejects ohlcv-store, undefined labels, and empty provenance bundles', () => {
    const base = buildAllGoKpiInput();
    const ohlcvPoisoned: KpiEvaluationInput = {
      ...base,
      provenance: {
        ...base.provenance,
        snapshots: [{ ...base.provenance.snapshots[0]!, source: 'ohlcv-store' }],
      },
    };
    expect(() => evaluatePolymarketKpis(ohlcvPoisoned)).toThrow(KpiProvenanceError);

    const unlabelled: KpiEvaluationInput = {
      ...base,
      provenance: {
        ...base.provenance,
        snapshots: [{ ...base.provenance.snapshots[0]!, source: undefined }],
      },
    };
    expect(() => evaluatePolymarketKpis(unlabelled)).toThrow(KpiProvenanceError);

    const empty: KpiEvaluationInput = {
      ...base,
      provenance: { snapshots: [], priceRows: [], tradeRows: [], l2Steps: [] },
    };
    expect(() => evaluatePolymarketKpis(empty)).toThrow(KpiProvenanceError);
  });

  it('uses min(asks) and max(bids) on descending replayed L2 books and ignores far-tail 0.999 asks', () => {
    const replayed = replayRows([
      {
        t: 1_762_000_000_000,
        source: L2_SOURCE_RECORDED,
        assetId: 'tok-yes-desc',
        eventType: 'book',
        bids: [
          { price: '0.001', size: '500000' },
          { price: '0.500', size: '1000' },
        ],
        asks: [
          { price: '0.502', size: '1000' },
          { price: '0.999', size: '1000000' },
        ],
      },
    ]);
    expect(replayed[0]!.asks[0]!.price).toBe('0.999');
    const capacity = estimateClusterDeployableCapacity(replayed);
    expect(capacity).toBeCloseTo(502, 2);
  });

  it('excludes out-of-scope 5-minute crypto contracts', () => {
    expect(isExcludedFiveMinuteContract('Bitcoin Up or Down - 5 min window')).toBe(true);
    expect(isExcludedFiveMinuteContract('ETH 5-minute candle above 3000?')).toBe(true);
    expect(isExcludedFiveMinuteContract('Will macro rate cut occur before Q4 meeting?')).toBe(
      false,
    );
  });
});
