
import { expect, test } from 'vitest';
import { getPurgedIndices } from '../cpcv';

test('purged indices calculation', () => {
  const train: { startIdx: number; endIdx: number } = { startIdx: 0, endIdx: 100 };
  const testSplit: { startIdx: number; endIdx: number } = { startIdx: 80, endIdx: 90 };
  const config = { purgeWindow: 5, embargoWindow: 3 };

  const valid = getPurgedIndices(train, testSplit, config, 100);

  // Expected purge region: 80-5=75 to 90+3=93
  // Result should exclude 75-93 from the train range [0, 100]
  // Remaining: [0, 75], [93, 100]

  const segments = valid.filter((s) => s.endIdx > s.startIdx);
  console.log('segments:', segments);
  expect(segments).toHaveLength(2);
  expect(segments[0]).toEqual({ startIdx: 0, endIdx: 75 });
  expect(segments[1]).toEqual({ startIdx: 93, endIdx: 100 });
});
