/**
 * AI Signal Paper Router Equity and Fill Tracker
 */

import type { PaperExecutor } from '../execution/paper-executor';
import type { PaperTradeFillRecord } from '../execution/paper-position-types';
import type { EquityPoint } from './ai-signal-paper-router-types';

export class PaperEquityTracker {
  private readonly fillRecords: PaperTradeFillRecord[] = [];
  private readonly equityCurve: EquityPoint[] = [];
  private highWaterMark = 0;
  private maxHistoricalDrawdown = 0;
  private readonly paperExecutor: PaperExecutor;

  constructor(paperExecutor: PaperExecutor) {
    this.paperExecutor = paperExecutor;
    this.initialize();
  }

  private initialize(): void {
    const summary = this.paperExecutor.getPnlSummary();
    const positions = this.paperExecutor.getPositions();
    const positionValue = positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
    const initialEquity = summary.balance + positionValue;
    this.highWaterMark = initialEquity > 0 ? initialEquity : (summary.equity > 0 ? summary.equity : 10_000);
    this.recordSnapshot();
  }

  setHighWaterMark(equity: number): void {
    this.highWaterMark = equity;
  }

  addFillRecord(fillRecord: PaperTradeFillRecord): void {
    this.fillRecords.push(fillRecord);
  }

  getFillRecords(strategyId?: string): PaperTradeFillRecord[] {
    return strategyId
      ? this.fillRecords.filter((r) => r.strategyId === strategyId)
      : [...this.fillRecords];
  }

  getEquityCurve(): EquityPoint[] {
    return [...this.equityCurve];
  }

  reset(equity: number): void {
    this.fillRecords.length = 0;
    this.equityCurve.length = 0;
    this.highWaterMark = equity;
    this.maxHistoricalDrawdown = 0;
    this.recordSnapshot();
  }

  recordSnapshot(): void {
    const summary = this.paperExecutor.getPnlSummary();
    const positions = this.paperExecutor.getPositions();
    const now = Date.now();

    const unrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const positionValue = positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
    const currentEquity = summary.balance + positionValue;

    if (currentEquity > this.highWaterMark) {
      this.highWaterMark = currentEquity;
    }

    const currentDrawdown =
      this.highWaterMark > 0
        ? (this.highWaterMark - currentEquity) / this.highWaterMark
        : 0;

    if (currentDrawdown > this.maxHistoricalDrawdown) {
      this.maxHistoricalDrawdown = currentDrawdown;
    }

    this.equityCurve.push({
      timestamp: now,
      isoDate: new Date(now).toISOString(),
      balance: summary.balance,
      unrealizedPnl,
      realizedPnl: summary.totalPnl,
      equity: currentEquity,
      highWaterMark: this.highWaterMark,
      drawdown: currentDrawdown,
      maxDrawdown: this.maxHistoricalDrawdown,
      openPositionsCount: positions.length,
    });
  }
}
