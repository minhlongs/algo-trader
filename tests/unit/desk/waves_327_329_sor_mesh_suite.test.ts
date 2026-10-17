import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ContKukanov2017MultiExchange,
  FoucaultKadanKandel2005MakeTake,
  LaruelleLehalle2013DarkPoolSplit,
  OpenCoreSaas2026Monetization,
} from '../../../src/desk/index';

describe('Waves 327-329 Multi-Venue SOR Triad & Stitch Screen #13 (order-routing-mesh)', () => {
  it('Wave 327: Cont & Kukanov (2017) allocates across heterogeneous venues and computes fill probability', () => {
    const engine = new ContKukanov2017MultiExchange.ContKukanov2017MultiExchange();
    const res = engine.evaluate({
      targetQuantity: 26.525,
      underfillPenaltyBps: 12,
      overfillPenaltyBps: 4,
      venues: [
        { venueId: 'BINANCE', queueDepthUnits: 5, expectedOutflowMean: 18, expectedOutflowStd: 4, makerRebateBps: 1.5, takerFeeBps: 3.5, halfSpreadBps: 0.8 },
        { venueId: 'OKX', queueDepthUnits: 6, expectedOutflowMean: 14, expectedOutflowStd: 3.5, makerRebateBps: 1.2, takerFeeBps: 4.0, halfSpreadBps: 0.9 },
        { venueId: 'BYBIT', queueDepthUnits: 7, expectedOutflowMean: 12, expectedOutflowStd: 3.2, makerRebateBps: 1.0, takerFeeBps: 4.5, halfSpreadBps: 1.0 },
      ],
    });

    expect(res.allocations).toHaveLength(3);
    expect(res.totalAllocatedUnits).toBeGreaterThan(26.525);
    expect(res.weightedFillProbability).toBeGreaterThan(0.5);
    expect(res.expectedExecutionSavingsBps).toBeGreaterThan(0);
    expect(['PASSIVE_MULTI_VENUE', 'HYBRID_LIT_SWEEP']).toContain(res.routingRegime);
  });

  it('Wave 328: Laruelle, Lehalle & Pages (2013) optimizes dark vs lit pool split with positive cost savings', () => {
    const engine = new LaruelleLehalle2013DarkPoolSplit.LaruelleLehalle2013DarkPoolSplit();
    const res = engine.evaluate({
      parentOrderQuantity: 26.525,
      darkPoolMeanLiquidity: 18.0,
      darkPoolRebateBps: 0.8,
      litHalfSpreadBps: 1.5,
      litLinearImpactBpsPerUnit: 0.12,
      adverseSelectionPenaltyBps: 0.6,
    });

    expect(res.optimalDarkRatio).toBeGreaterThan(0);
    expect(res.optimalDarkRatio).toBeLessThanOrEqual(1);
    expect(res.darkAllocatedUnits + res.litAllocatedUnits).toBeCloseTo(26.525, 2);
    expect(res.costSavingsVsAllLitBps).toBeGreaterThan(0);
  });

  it('Wave 329: Foucault, Kadan & Kandel (2005) computes make/take cutoff spread and optimal action', () => {
    const engine = new FoucaultKadanKandel2005MakeTake.FoucaultKadanKandel2005MakeTake();
    const wideSpreadRes = engine.evaluate({
      currentSpreadBps: 8.5,
      tickSizeBps: 0.5,
      orderArrivalRatePerSec: 4.0,
      waitingCostBpsPerSec: 0.4,
      proportionPatientTraders: 0.6,
      makerRebateBps: 1.2,
      takerFeeBps: 3.5,
    });

    expect(wideSpreadRes.cutoffSpreadBps).toBeGreaterThan(0);
    expect(wideSpreadRes.netMakeAdvantageBps).toBeGreaterThan(0);
    expect(wideSpreadRes.optimalAction).toBe('LIMIT_MAKE_IMPROVE');
  });

  it('Stitch Screen #13 (order-routing-mesh): verifies SOR Mesh snapshot and HTML deliverable', () => {
    const cockpit = new OpenCoreSaas2026Monetization.StitchUiCockpitEngine();
    const sorMesh = cockpit.getSorMeshSnapshot('ALMGREN_CHRISS_OPTIMAL', 2500000);

    expect(sorMesh.screenId).toBe('order-routing-mesh');
    expect(sorMesh.screenNumber).toBe(13);
    expect(sorMesh.parentOrderNotionalUsd).toBe(2500000);
    expect(sorMesh.fillCompletionRatePct).toBe(98.4);
    expect(sorMesh.realizedSlippageBps).toBe(-0.42);
    expect(sorMesh.venues).toHaveLength(6);
    expect(sorMesh.markoutSentry.map((m) => m.horizonLabel)).toEqual(['100ms', '1s', '10s']);

    const htmlPath = join(process.cwd(), 'site/public/order-routing-mesh.html');
    expect(existsSync(htmlPath)).toBe(true);
    const htmlContent = readFileSync(htmlPath, 'utf8');
    expect(htmlContent).toContain('Multi-Venue Best Execution Heatmap');
    expect(htmlContent).toContain('Dynamic Splitter Algorithm Selector');
    expect(htmlContent).toContain('$2,500,000');
    expect(htmlContent).toContain('-0.42 bps');
  });
});
