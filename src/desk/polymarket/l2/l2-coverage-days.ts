import {
  policyUtcBounds, UTC_DAY_MS,
  type L2CoverageDay, type L2CoverageDayStatus, type L2CoveragePolicy,
} from './l2-coverage-policy';
import type { L2CoverageObservation, L2CoverageWalData } from './l2-coverage-wal';

export function classifyL2CoverageDays(policy: L2CoveragePolicy, status: L2CoverageDayStatus, reason: string): L2CoverageDay[] {
  const { startMs, endMs } = policyUtcBounds(policy);
  const days: L2CoverageDay[] = [];
  for (let start = startMs; start < endMs; start += UTC_DAY_MS) {
    days.push({ dayUtc: new Date(start).toISOString().slice(0, 10), status, validBookFrames: 0, reasons: [reason] });
  }
  return days;
}

function coversClock(points: readonly number[], start: number, end: number, maxGap: number): boolean {
  const sorted = [...points].sort((a, b) => a - b);
  return sorted[0]! - start <= maxGap && end - sorted[sorted.length - 1]! <= maxGap &&
    sorted.every((point, index) => index === 0 || point - sorted[index - 1]! <= maxGap);
}

function continuousBooks(books: readonly L2CoverageObservation[]): boolean {
  if (books.length < 2 || !books[0]?.snapshot || books[0].sequence !== 0 || books[0].recvMs === books.at(-1)?.recvMs) return false;
  return books.every((book, index) => {
    if (index === 0) return true;
    const previous = books[index - 1]!;
    if (book.session !== previous.session || book.exchangeMs < previous.exchangeMs) return false;
    if (book.sequence === previous.sequence + 1) return true;
    // The sidecar resets its per-token sequence to 0 for each full WS snapshot.
    return book.snapshot && book.sequence === 0 && book.recvMs > previous.recvMs;
  });
}

/** Both clocks and every approved token must span the UTC day, including its two edges. */
export function evaluateL2CoverageDays(policy: L2CoveragePolicy, data: L2CoverageWalData): L2CoverageDay[] {
  const { startMs, endMs } = policyUtcBounds(policy);
  const tokens = policy.expectedUniverse.flatMap((market) => market.tokenIds);
  const booksByDay = new Map<number, Map<string, L2CoverageObservation[]>>();
  for (const book of data.observations) {
    const day = Math.floor(book.recvMs / UTC_DAY_MS) * UTC_DAY_MS;
    let tokensForDay = booksByDay.get(day);
    if (!tokensForDay) booksByDay.set(day, tokensForDay = new Map());
    let tokenBooks = tokensForDay.get(book.tokenId);
    if (!tokenBooks) tokensForDay.set(book.tokenId, tokenBooks = []);
    tokenBooks.push(book);
  }
  const interruptedDays = new Set(data.interruptions.map((timestamp) => Math.floor(timestamp / UTC_DAY_MS) * UTC_DAY_MS));
  const days: L2CoverageDay[] = [];
  for (let start = startMs; start < endMs; start += UTC_DAY_MS) {
    const end = start + UTC_DAY_MS;
    const tokensForDay = booksByDay.get(start);
    const reasons: string[] = [];
    let validBookFrames = 0;
    let status: L2CoverageDayStatus = 'QUALIFIED';
    if (!tokensForDay) {
      status = data.frameDays.has(start) || (data.frameDays.size === 0 && data.hasWalSegments) ? 'ZERO_FRAMES' : 'MISSING';
      reasons.push(`${status} no verified book frames in UTC day`);
    } else {
      for (const token of tokens) {
        const tokenBooks = tokensForDay.get(token);
        if (!tokenBooks) {
          status = 'MISSING';
          reasons.push(`MISSING expected token ${token}`);
          continue;
        }
        validBookFrames += tokenBooks.length;
        tokenBooks.sort((a, b) => a.recvMs - b.recvMs);
        const complete = coversClock(tokenBooks.map((book) => book.recvMs), start, end, policy.maxGapMs) &&
          coversClock(tokenBooks.map((book) => book.exchangeMs), start, end, policy.maxGapMs);
        if (!complete || !continuousBooks(tokenBooks)) {
          if (status !== 'MISSING') status = 'GAP';
          reasons.push(`GAP incomplete UTC-day coverage or book continuity for token ${token}`);
        }
      }
    }
    if (interruptedDays.has(start)) {
      if (status === 'QUALIFIED') status = 'GAP';
      reasons.push('GAP capture interruption or failed book validation');
    }
    days.push({ dayUtc: new Date(start).toISOString().slice(0, 10), status, validBookFrames, reasons });
  }
  return days;
}
