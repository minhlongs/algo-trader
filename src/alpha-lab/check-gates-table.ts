/**
 * Check Gates Table Renderer
 *
 * Formats gate values, thresholds, and renders the human-readable
 * gate status table for CLI and reporting output.
 */

import type { GateThreshold, PromotionReadiness } from './gates/gate-types';
import { GATE_THRESHOLDS } from './gates/gate-types';

export function formatGateValue(gate: { currentValue: number | null; id: string }): string {
  if (gate.currentValue === null) return 'N/A';
  if (gate.id === 'win_rate' || gate.id === 'max_drawdown') {
    return `${(gate.currentValue * 100).toFixed(1)}%`;
  }
  if (gate.id === 'kelly_wired' || gate.id === 'circuit_breaker' || gate.id === 'exchange_connectivity') {
    return gate.currentValue === 1 ? 'Yes' : 'No';
  }
  return String(Math.round(gate.currentValue * 100) / 100);
}

export function formatThreshold(gate: { threshold: number | null; id: string }): string {
  if (gate.threshold === null) return '-';
  const meta = GATE_THRESHOLDS.find((g: GateThreshold) => g.id === gate.id);
  if (!meta) return '-';
  const prefix = meta.direction === 'at_most' ? '<= ' : '>= ';
  if (gate.id === 'win_rate' || gate.id === 'max_drawdown') {
    return `${prefix}${(gate.threshold * 100).toFixed(0)}%`;
  }
  if (gate.id === 'duration') return `${prefix}${gate.threshold}d`;
  return `${prefix}${gate.threshold}`;
}

export function renderGateTable(reading: PromotionReadiness): string {
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
  lines.push(`Result: ${reading.passedCount}/${reading.totalGates} gates passing`);

  if (reading.allPassed) {
    lines.push('STATUS: ALL GATES PASSING — eligible for live promotion');
  } else {
    lines.push(`STATUS: ${reading.totalGates - reading.passedCount} gate(s) still failing`);
    if (reading.estimatedDaysRemaining !== null && reading.estimatedDaysRemaining > 0) {
      lines.push(`Estimated days until duration gate: ${reading.estimatedDaysRemaining}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}
