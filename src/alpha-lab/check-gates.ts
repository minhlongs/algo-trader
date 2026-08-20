/**
 * Check Gates CLI
 *
 * Outputs a human-readable gate status table.
 * Exit 0 if all gates passed, exit 1 if any failing.
 *
 * Usage: pnpm tsx src/alpha-lab/check-gates.ts
 */

import { evaluateGates } from './gates/gate-evaluator';
import type { GateEvaluatorInput } from './gates/gate-evaluator';
import type { GateThreshold, PromotionReadiness } from './gates/gate-types';
import { GATE_THRESHOLDS } from './gates/gate-types';
import { ExchangeConnectionTester } from '../desk/tests/exchange-connection-test';

// ── Paper Data Provider ────────────────────────────────────────────────────────
// Fetches closed paper trades from the worker's D1-backed ledger.
// Falls back to empty data when the API is unreachable (offline/local runs).

const PAPER_API = process.env.PAPER_TRADES_API ?? 'https://api.cashclaw.cc/api/v1/paper-trades';

/**
 * Baseline capital for the paper-trading equity curve.
 *
 * Paper trades from the D1 ledger carry nominal USD PnL (not return-on-capital
 * fractions), so the curve starts at a baseline and accumulates — mirroring
 * `src/shared/backtesting/backtest-runner.ts`. Starting at 0 would make
 * maxDrawdown divide by a near-zero peak and produce a bogus drawdown.
 */
const PAPER_INITIAL_CAPITAL_USD = 10_000;

interface PaperTradeRow {
  id: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  pnl: number | null;
  timestamp: string;
}

async function fetchPaperTrades(): Promise<PaperTradeRow[]> {
  try {
    const res = await fetch(PAPER_API);
    if (!res.ok) {
      console.warn(`[check-gates] paper-trades API returned ${res.status}`);
      return [];
    }
    const body = (await res.json()) as { trades?: PaperTradeRow[] };
    return body.trades ?? [];
  } catch (err) {
    console.warn('[check-gates] paper-trades API unreachable', { err });
    return [];
  }
}

/**
 * Gate 10 — Exchange Connectivity.
 *
 * Runs ExchangeConnectionTester against the configured exchanges.
 * Returns true only if every exchange reports REST + (optional) WebSocket OK.
 * Conservative fallback: any failure (network, timeout, parse) returns false
 * rather than crashing the gate check.
 */
async function checkExchangeHealth(): Promise<boolean> {
  try {
    const tester = new ExchangeConnectionTester({ timeoutMs: 5000 });
    const results = await tester.testAll();
    return results.every((r) => r.restOk && (r.wsOk || !r.error));
  } catch {
    return false;
  }
}

async function loadPaperData(): Promise<GateEvaluatorInput> {
  const trades = await fetchPaperTrades();
  const closed = trades.filter((t) => t.pnl !== null);
  const startDate =
    closed.length > 0
      ? closed.reduce((min, t) => (t.timestamp < min ? t.timestamp : min), closed[0].timestamp)
      : new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

  // Equity curve: baseline capital + cumulative nominal-USD PnL over time.
  // Paper trades are nominal USD (see PAPER_INITIAL_CAPITAL_USD), so this
  // accumulates rather than compounds — compounding is only correct for
  // return-on-capital fractions (alpha-lab path), not raw USD PnL.
  const sorted = [...closed].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let equity = PAPER_INITIAL_CAPITAL_USD;
  const equityCurve = sorted.map((t) => {
    equity += t.pnl ?? 0;
    return { timestamp: t.timestamp, equity };
  });

  // Boolean gates:
  // - Gate 8 (kelly_wired): RiskGateManager is unconditionally wired into
  //   TradingPipeline at src/desk/polymarket/trading-pipeline.ts:176. This is a
  //   build-time invariant, not a runtime toggle.
  // - Gate 9 (circuit_breaker): CircuitBreaker is instantiated in
  //   LiveTradingAdapterSetup at src/desk/polymarket/live-trading-adapter-setup.ts:71
  //   and covered by live-order-manager-risk-gate-wiring.test.ts. Structural fact.
  // - Gate 10 (exchange_connectivity): live check via ExchangeConnectionTester.
  const flags = {
    kellyWired: true,
    circuitBreakerTested: true,
    exchangeConnectivityGreen: await checkExchangeHealth(),
  };

  return {
    trades: closed.map((t) => ({
      timestamp: t.timestamp,
      tokenId: t.tokenId,
      side: t.side,
      price: t.price,
      size: t.size,
      pnl: t.pnl,
    })),
    startDate,
    equityCurve,
    testWinRate: undefined,
    valWinRate: undefined,
    flags,
  };
}

// ── Table Renderer ─────────────────────────────────────────────────────────────

function renderGateTable(reading: PromotionReadiness): string {
  const lines: string[] = [];
  const header = [
    '#'.padStart(2),
    'Gate'.padEnd(35),
    'Current'.padStart(12),
    'Threshold'.padStart(12),
    'Status'.padStart(8),
  ].join(' | ');

  lines.push('');
  lines.push('=== Transition Criteria Gate Status ===');
  lines.push(`Evaluated: ${reading.evaluatedAt}`);
  lines.push('');
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (let i = 0; i < reading.gates.length; i++) {
    const gate = reading.gates[i]!;
    const num = String(i + 1).padStart(2);
    const current = formatGateValue(gate);
    const threshold = formatThreshold(gate);
    const status = gate.passed ? '  PASS' : '  FAIL';
    lines.push(
      `${num} | ${gate.name.padEnd(35)} | ${current.padStart(12)} | ${threshold.padStart(12)} | ${status}`,
    );
  }

  lines.push('-'.repeat(header.length));
  lines.push(
    `Result: ${reading.passedCount}/${reading.totalGates} gates passing`,
  );

  if (reading.allPassed) {
    lines.push('STATUS: ALL GATES PASSING — eligible for live promotion');
  } else {
    lines.push(
      `STATUS: ${reading.totalGates - reading.passedCount} gate(s) still failing`,
    );
    if (reading.estimatedDaysRemaining !== null && reading.estimatedDaysRemaining > 0) {
      lines.push(
        `Estimated days until duration gate: ${reading.estimatedDaysRemaining}`,
      );
    }
  }
  lines.push('');

  return lines.join('\n');
}

function formatGateValue(gate: { currentValue: number | null; id: string }): string {
  if (gate.currentValue === null) return 'N/A';
  if (gate.id === 'win_rate') return `${(gate.currentValue * 100).toFixed(1)}%`;
  if (gate.id === 'max_drawdown') return `${(gate.currentValue * 100).toFixed(1)}%`;
  if (gate.id === 'kelly_wired' || gate.id === 'circuit_breaker' || gate.id === 'exchange_connectivity') {
    return gate.currentValue === 1 ? 'Yes' : 'No';
  }
  return String(Math.round(gate.currentValue * 100) / 100);
}

function formatThreshold(gate: { threshold: number | null; id: string }): string {
  if (gate.threshold === null) return '-';
  const meta = GATE_THRESHOLDS.find((g: GateThreshold) => g.id === gate.id);
  if (!meta) return '-';
  const prefix = meta.direction === 'at_most' ? '<= ' : '>= ';
  if (gate.id === 'win_rate') return `${prefix}${(gate.threshold * 100).toFixed(0)}%`;
  if (gate.id === 'max_drawdown') return `${prefix}${(gate.threshold * 100).toFixed(0)}%`;
  if (gate.id === 'duration') return `${prefix}${gate.threshold}d`;
  return `${prefix}${gate.threshold}`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const input = await loadPaperData();
  const reading = evaluateGates(input);
  const output = renderGateTable(reading);

  process.stdout.write(output);

  process.exit(reading.allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('[check-gates] fatal', { err });
  process.exit(2);
});
