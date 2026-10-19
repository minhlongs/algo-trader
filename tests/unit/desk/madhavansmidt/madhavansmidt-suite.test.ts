import { describe, it, expect } from 'vitest';
import { MadhavanSmidtEngine } from '../../../../src/desk/madhavansmidt/madhavansmidt-engine.js';
import { MadhavanSmidtObservation } from '../../../../src/desk/madhavansmidt/madhavansmidt-types.js';

describe('Madhavan-Smidt (1991) Specialist Inventory Suite', () => {
  it('validates minimum sample size', () => {
    expect(() =>
      MadhavanSmidtEngine.estimate({ observations: [] })
    ).toThrow();
  });

  it('estimates adverse selection, inventory control, and order processing parameters', () => {
    const obs: MadhavanSmidtObservation[] = [];
    let pMid = 100.0;
    let inv = 10.0;

    for (let t = 0; t < 50; t++) {
      const direction = t % 2 === 0 ? 1 : -1;
      const volume = 100 + (t % 5) * 10;
      const priorMid = pMid;
      const tradePrice = priorMid + direction * 0.25;

      // Specialist inventory changes
      inv -= direction * (volume / 100);

      // Quote revision: reacts positively to signed volume and shades price against excess inventory
      const nextMid = priorMid + direction * 0.05 - (inv > 0 ? 0.01 : -0.01);
      pMid = nextMid;

      obs.push({
        tradePrice,
        tradeVolume: volume,
        tradeDirection: direction,
        inventory: inv,
        priorQuoteMidpoint: priorMid,
        nextQuoteMidpoint: nextMid,
      });
    }

    const res = MadhavanSmidtEngine.estimate({ observations: obs });
    expect(res.sampleSize).toBe(50);
    expect(res.adverseSelectionWeight).toBeGreaterThan(0);
    expect(res.orderProcessingCost).toBeGreaterThan(0);
    expect(res.inventoryHoldingCost).toBeGreaterThanOrEqual(0);
  });
});
