import { expect, test } from 'vitest';
import { TPEOptimizer } from '../tpe-optimizer';

test('TPE basic suggestion', () => {
  const optimizer = new TPEOptimizer([{ name: 'x', min: 0, max: 1 }]);
  const suggestion = optimizer.suggest();
  expect(suggestion.x).toBeGreaterThanOrEqual(0);
  expect(suggestion.x).toBeLessThanOrEqual(1);

  optimizer.record({ params: { x: 0.5 }, score: 10 });
  const best = optimizer.getBest();
  expect(best?.params.x).toBe(0.5);
});
