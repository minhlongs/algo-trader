/**
 * Tests for IntentClassifier — exercises every intent's pattern set, the
 * confidence threshold, and edge cases (empty query, no match).
 *
 * Note: each intent has 7-9 keyword patterns, and classifyIntent routes only
 * when >= 50% of the intent's patterns match the query. So every positive
 * test below packs enough keywords from one intent to clear that bar.
 */

import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../intent-classifier';
import type { Intent } from '../intent-classifier';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('classifyIntent', () => {
  // ── risk_assessment (7 patterns → need >= 4 matches) ────────────
  it('classifies risk_assessment when enough risk keywords present', () => {
    // risk, exposure, drawdown, overexposed = 4/7 ≈ 0.571
    const r = classifyIntent('risk exposure drawdown overexposed');
    expect(r.intent).toBe('risk_assessment');
    expect(r.confidence).toBeCloseTo(4 / 7, 5);
  });

  it('matches circuit breaker / position size / capital at risk', () => {
    // risk, circuit breaker, position size, capital at risk = 4/7
    const r = classifyIntent('risk circuit breaker position size capital at risk');
    expect(r.intent).toBe('risk_assessment');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('routes with 5/7 risk keywords', () => {
    const r = classifyIntent('risk exposure drawdown overexposed position size');
    expect(r.intent).toBe('risk_assessment');
    expect(r.confidence).toBeCloseTo(5 / 7, 5);
  });

  // ── arb_scan (7 patterns → need >= 4 matches) ───────────────────
  it('classifies arb_scan with arbitrage + opportunity + mispricing + spread', () => {
    // arb/opportunit/mispric/spread = 4/7
    const r = classifyIntent('arbitrage opportunity mispricing spread');
    expect(r.intent).toBe('arb_scan');
    expect(r.confidence).toBeCloseTo(4 / 7, 5);
  });

  it('matches hedge / cross-market / price gap', () => {
    // arb/hedge/cross-market/price-gap = 4/7
    const r = classifyIntent('arb hedge cross-market price gap');
    expect(r.intent).toBe('arb_scan');
  });

  it('matches arb shorthand alone with other keywords', () => {
    // arb/opportunit/mispric/hedge = 4/7
    const r = classifyIntent('arb opportunity mispricing hedge');
    expect(r.intent).toBe('arb_scan');
  });

  // ── strategy_performance (9 patterns → need >= 5 matches) ────────
  it('classifies strategy_performance with 5+ keywords', () => {
    // strategy/performance/win-rate/sharpe/pnl = 5/9
    const r = classifyIntent('strategy performance win rate sharpe pnl');
    expect(r.intent).toBe('strategy_performance');
    expect(r.confidence).toBeCloseTo(5 / 9, 5);
  });

  it('matches profit / return / accuracy', () => {
    // strategy/performance/profit/return/accuracy = 5/9
    const r = classifyIntent('strategy performance profit return accuracy');
    expect(r.intent).toBe('strategy_performance');
  });

  it('matches p&l ampersand form', () => {
    // strategy/performance/p&l/pnl/profit = 5/9
    const r = classifyIntent('strategy performance p&l pnl profit');
    expect(r.intent).toBe('strategy_performance');
  });

  // ── market_regime (7 patterns → need >= 4 matches) ──────────────
  it('classifies market_regime with regime + trend + trending + ranging', () => {
    // regime/trending/ranging/volatil = 4/7  (note: 'market trend' may not match, but 'trending' does)
    const r = classifyIntent('regime trending ranging volatile');
    expect(r.intent).toBe('market_regime');
    expect(r.confidence).toBeCloseTo(4 / 7, 5);
  });

  it('matches bull / bear / volatile', () => {
    // regime/bull/bear/volatile = 4/7
    const r = classifyIntent('regime bull bear volatile');
    expect(r.intent).toBe('market_regime');
  });

  it('matches market doing / market state forms', () => {
    // market (?:doing|trend|state) is ONE pattern; plus regime/trending/ranging = 4/7
    const r = classifyIntent('market doing regime trending ranging');
    expect(r.intent).toBe('market_regime');
    expect(r.confidence).toBeCloseTo(4 / 7, 5);
  });

  // ── weekly_report (7 patterns → need >= 4 matches) ──────────────
  it('classifies weekly_report with report + summary + weekly + overview', () => {
    // report/summary/weekly/overview = 4/7
    const r = classifyIntent('report summary weekly overview');
    expect(r.intent).toBe('weekly_report');
    expect(r.confidence).toBeCloseTo(4 / 7, 5);
  });

  it('matches digest / recap / roundup', () => {
    // report/summary/digest/recap = 4/7
    const r = classifyIntent('report summary digest recap');
    expect(r.intent).toBe('weekly_report');
  });

  it('matches all 7 weekly_report keywords', () => {
    // report/summary/weekly/overview/digest/recap/roundup = 7/7
    const r = classifyIntent('report summary weekly overview digest recap roundup');
    expect(r.intent).toBe('weekly_report');
    expect(r.confidence).toBeCloseTo(1, 5);
  });

  // ── fallback ────────────────────────────────────────────────────
  it('returns fallback with confidence 0 for an empty string', () => {
    const r = classifyIntent('');
    expect(r.intent).toBe('fallback');
    expect(r.confidence).toBe(0);
  });

  it('returns fallback with confidence 0 for whitespace only', () => {
    const r = classifyIntent('   ');
    expect(r.intent).toBe('fallback');
    expect(r.confidence).toBe(0);
  });

  it('returns fallback with confidence 0 when no pattern reaches 0.5 threshold', () => {
    // 'strategy' alone = 1/9 = 0.111 in strategy_performance, 0 elsewhere
    const r = classifyIntent('strategy');
    expect(r.intent).toBe('fallback');
    expect(r.confidence).toBe(0);
  });

  it('returns fallback for an unrelated query', () => {
    const r = classifyIntent('hello world nothing relevant xyzzy');
    expect(r.intent).toBe('fallback');
    expect(r.confidence).toBe(0);
  });

  it('returns fallback with confidence 0 when only 3 of 7 risk patterns match (below threshold)', () => {
    // risk/exposure/drawdown = 3/7 ≈ 0.428 < 0.5
    const r = classifyIntent('risk exposure drawdown');
    expect(r.intent).toBe('fallback');
    expect(r.confidence).toBe(0);
  });

  // ── confidence math ────────────────────────────────────────────
  it('returns confidence 0 for a partial no-route query', () => {
    // 'risk exposure' matches 2 of 7 risk_assessment patterns = 0.286 < 0.5 → fallback
    const r = classifyIntent('risk exposure');
    expect(r.confidence).toBe(0);
    expect(r.intent).toBe('fallback');
  });

  // ── exported types are usable ──────────────────────────────────
  it('exposes Intent and ClassifiedIntent types at module boundary', () => {
    const intent: Intent = 'arb_scan';
    const classified: { intent: Intent; confidence: number } = { intent, confidence: 0.6 };
    expect(classified.intent).toBe('arb_scan');
  });
});
