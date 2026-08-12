# Fix Intelligence Module Quality Bugs (E2-E5 + :any cleanup)

## Context
After LlmRouter migration (`25d3c67de`), code review flagged 5 pre-existing bugs across 3 files. These are NOT migration regressions — they existed before the migration.

## Scope
3 files, ~15 lines changed total.

---

## Fix 1 — E2: Swarm fail-open on single persona failure
**File:** `src/intelligence/signal-consensus-swarm.ts`
**Lines:** 207-210 (result parsing)

**Bug:** When 1 of 3 persona LLM calls fails, the failed persona is simply dropped from the `votes` array. With only 2 votes remaining, `majorityThreshold = 2 * 0.5 = 1.0` — a single APPROVE passes the signal.

**Fix:** Add a synthetic REJECT vote for each failed persona instead of dropping them:
```ts
const votes: SwarmVote[] = results
  .filter(r => r.status === 'fulfilled')
  .map(r => parseSwarmVote(r.raw, r.persona))
  .concat(
    results
      .filter(r => r.status === 'rejected')
      .map(r => ({
        persona: r.persona as SwarmVote['persona'],
        vote: 'REJECT' as const,
        confidence: 0,
        reasoning: `Persona call failed: ${r.reason}`,
      })),
  );
```
Remove the `failedCount >= 2` early-return block (lines 211-224) — the synthetic votes now enforce fail-closed naturally.

**Acceptance:** 3-persona swarm with 1 failure → 3 votes (2 real + 1 synthetic REJECT) → needs 2 real APPROVEs to pass.

---

## Fix 2 — E3: consensusConfidence averages ALL votes instead of majority
**File:** `src/intelligence/signal-consensus-swarm.ts`
**Lines:** 110-112

**Bug:** `consensusConfidence = totalConfidence / totalVotes` averages ALL votes including REJECTs, inflating confidence when dissenters have high confidence.

**Fix:** Average only majority-side votes:
```ts
const majorityVotes = votes.filter(v =>
  approved ? v.vote === 'APPROVE' : v.vote === 'REJECT',
);
const consensusConfidence = majorityVotes.length > 0
  ? majorityVotes.reduce((sum, v) => sum + v.confidence, 0) / majorityVotes.length
  : 0;
```

**Acceptance:** If 2 APPROVE (0.9, 0.8) + 1 REJECT (0.95), `consensusConfidence = 0.85` (not 0.883).

---

## Fix 3 — E4: buildHedge falls back to markets[0] on unmatched titles
**File:** `src/desk/intelligence/logical-hedge-discovery.ts`
**Lines:** 149-150

**Bug:** LLM may hallucinate titles that don't match any market. `markets.find(...) ?? markets[0]` silently binds the hallucinated title to an arbitrary market.

**Fix:** Return null when titles don't match:
```ts
const marketA = markets.find(m => m.title === titleA);
const marketB = markets.find(m => m.title === titleB);
if (!marketA || !marketB) return null;
```
(Remove `?? markets[0]` and `?? markets[1]` fallbacks)

**Acceptance:** If LLM returns non-existent title, `buildHedge` returns null and the pair is skipped.

---

## Fix 4 — E5: Math.abs() in expectedEdge for directional pairs
**File:** `src/desk/intelligence/logical-hedge-discovery.ts`
**Line:** 153

**Bug:** `Math.abs(marketA.yesPrice - marketB.yesPrice)` reports edge for consistently-priced pairs (e.g. A=0.50, B=0.50 → edge=0.00, but A=0.80, B=0.80 also → edge=0.00). The hedge should only exist when prices diverge directionally.

**Fix:** Use directional edge:
```ts
const edge = Math.max(0, marketA.yesPrice - marketB.yesPrice);
```
Pairs where B is more expensive than A yield 0 edge (correctly no hedge opportunity).

**Acceptance:** A=0.80, B=0.50 → edge=0.30. A=0.50, B=0.80 → edge=0.00.

---

## Fix 5 — Remove 4 `:any` types in signal-validator.ts
**File:** `src/desk/intelligence/signal-validator.ts`
**Lines:** 256, 273, 277, 307

Replace with proper types:
- Line 256: `parseCombinedResponse(raw: string): any` → define `RawCombinedJson` interface
- Line 273: `verifyAndAggregateVotes(parsedJson: any, ...)` → use `RawCombinedJson`
- Line 277: `(v: any)` → use `RawVote` type
- Line 307: `(r: any)` → use `string`

---

## Verification
1. `npx tsc --noEmit` — 0 errors
2. `npm test` — all pass (no new failures)
3. Code review by `code-reviewer` subagent

## Risk
Low — all changes are internal logic fixes, no public contract changes.
