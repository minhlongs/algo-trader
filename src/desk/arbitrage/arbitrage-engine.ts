/**
 * Automated Multi-Exchange Arbitrage Execution Engine.
 *
 * Master orchestrator integrating:
 * - OpportunityIngestionPipeline (M1)
 * - NetProfitabilityCalculator (M1)
 * - ArbitrageRiskGuard (M2)
 * - AtomicMultiLegCoordinator & CompensatoryUnwindHandler (M3)
 * - ArbitrageMetrics & ArbitrageAuditLogger (M4)
 *
 * Clean lifecycle methods: start(), stop(), isRunning(), getStatus(), executeOpportunity(opportunity).
 *
 * @module desk/arbitrage/arbitrage-engine
 */

import { logger } from '../../shared/utils/logger';
import type { IExchangeConnector } from './connectors/types';
import { OpportunityIngestionPipeline, type IngestionMetrics } from './opportunity-ingestion-pipeline';
import type { ArbitrageOpportunity as SpreadArbitrageOpportunity } from './spread-detector-types';
import { NetProfitabilityCalculator } from './net-profitability-calculator';
import { ArbitrageRiskGuard, type ArbitrageRiskConfig } from './arbitrage-risk-guard';
import { AtomicMultiLegCoordinator } from './atomic-multileg-coordinator';
import {
  type MultiLegArbitrageOrder,
  type MultiLegExecutionReport,
} from './execution-types';
import {
  ArbitrageMetrics,
  recordArbOrder,
  recordArbLatency,
  recordArbPnl,
} from './arbitrage-metrics';
import { ArbitrageAuditLogger } from './telemetry/arbitrage-audit-logger';

export interface ArbitrageEngineConfig {
  mode: 'dry-run' | 'live';
  riskConfig?: Partial<ArbitrageRiskConfig>;
  minNetProfitBps?: number;
  maxSlippageBps?: number;
  symbols?: string[];
  venues?: string[];
}

export interface ArbitrageOpportunity {
  id: string;
  symbol?: string;
  type?: string;
  buyVenue?: string;
  sellVenue?: string;
  buyExchange?: string;
  sellExchange?: string;
  venues?: string[];
  buyPrice?: number;
  sellPrice?: number;
  tradeSize?: number;
  maxTradeSize?: number;
  amount?: number;
  spread?: number;
  spreadPercent?: number;
  spreadBps?: number;
  netProfitBps?: number;
  netProfitUsd?: number;
  expectedProfit?: number;
  expectedProfitPct?: number;
  estimatedGasUsd?: number;
  confidence?: number | 'high' | 'medium' | 'low';
  timestamp?: number;
  legs?: Array<{
    exchange?: string;
    venue?: string;
    symbol: string;
    side: 'buy' | 'sell';
    price: number;
    amount: number;
    fee?: number;
  }>;
}

export interface ArbitrageEngineStatus {
  running: boolean;
  mode: 'dry-run' | 'live';
  activeExecutions: number;
  ingestionMetrics: IngestionMetrics;
  auditChainLength: number;
  lastExecutionTimestamp?: number;
}

export class ArbitrageEngine {
  public readonly metrics: ArbitrageMetrics;
  public readonly auditLogger: ArbitrageAuditLogger;
  public readonly riskGuard: ArbitrageRiskGuard;
  public readonly profitabilityCalc: NetProfitabilityCalculator;
  public readonly ingestionPipeline: OpportunityIngestionPipeline;
  public readonly coordinator: AtomicMultiLegCoordinator;
  private readonly mode: 'dry-run' | 'live';
  private running = false;
  private activeExecutionCount = 0;
  private lastExecutionTimestamp?: number;

  constructor(
    private readonly connectorResolver: (venue: string) => IExchangeConnector | undefined,
    private readonly config: ArbitrageEngineConfig,
  ) {
    this.mode = config.mode;
    this.metrics = new ArbitrageMetrics();
    this.auditLogger = new ArbitrageAuditLogger();
    this.riskGuard = new ArbitrageRiskGuard({
      mode: this.mode === 'dry-run' ? 'paper' : 'live',
      ...config.riskConfig,
    });
    this.profitabilityCalc = new NetProfitabilityCalculator({
      defaultHurdleBps: config.minNetProfitBps ?? 10,
    });
    this.coordinator = new AtomicMultiLegCoordinator(
      this.connectorResolver,
    );

    this.ingestionPipeline = new OpportunityIngestionPipeline(
      {
        symbols: config.symbols,
        venues: config.venues,
        minHurdleBps: config.minNetProfitBps ?? 10,
        dryRun: this.mode === 'dry-run',
      },
      {
        calculator: this.profitabilityCalc,
        onAdmitted: async (opp: SpreadArbitrageOpportunity) => {
          await this.handleAdmittedOpportunity(opp);
        },
      },
    );

    // Provide convenience ingest method for backward compatibility
    const pipelineObj = this.ingestionPipeline as unknown as Record<string, unknown>;
    pipelineObj.ingest = (opp: ArbitrageOpportunity) => {
      this.submitOpportunity(opp);
    };
  }

  /**
   * Start master engine lifecycle (spread detector + ingestion loop).
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.ingestionPipeline.start();
    logger.info('[ArbitrageEngine] Started arbitrage execution engine', { mode: this.mode });
  }

  /**
   * Graceful stop of master engine lifecycle.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.ingestionPipeline.stop();
    logger.info('[ArbitrageEngine] Stopped arbitrage execution engine');
  }

  /**
   * Inspect active engine operational state.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Current operating mode: 'dry-run' | 'live'.
   */
  getMode(): 'dry-run' | 'live' {
    return this.mode;
  }

  /**
   * Comprehensive operational status snapshot.
   */
  getStatus(): ArbitrageEngineStatus {
    return {
      running: this.running,
      mode: this.mode,
      activeExecutions: this.activeExecutionCount,
      ingestionMetrics: this.ingestionPipeline.metrics,
      auditChainLength: this.auditLogger.getAuditHistory().length,
      lastExecutionTimestamp: this.lastExecutionTimestamp,
    };
  }

  /**
   * Submit opportunity to ingestion pipeline queue for deduplication and backpressure processing.
   */
  submitOpportunity(opportunity: ArbitrageOpportunity): void {
    const norm = this.normalizeSpreadOpportunity(opportunity);
    this.ingestionPipeline.handleOpportunities([norm]);
  }

  private normalizeSpreadOpportunity(opp: ArbitrageOpportunity): SpreadArbitrageOpportunity {
    const buyVenue = opp.buyVenue ?? opp.buyExchange ?? opp.venues?.[0] ?? 'unknown';
    const sellVenue = opp.sellVenue ?? opp.sellExchange ?? opp.venues?.[1] ?? 'unknown';
    const symbol = opp.symbol ?? opp.legs?.[0]?.symbol ?? 'UNKNOWN/USDT';
    const buyPrice = opp.buyPrice ?? opp.legs?.find((l) => l.side === 'buy')?.price ?? 0;
    const sellPrice = opp.sellPrice ?? opp.legs?.find((l) => l.side === 'sell')?.price ?? 0;
    const spread = opp.spread ?? (sellPrice - buyPrice);
    const spreadPercent = opp.spreadPercent ?? (buyPrice > 0 ? (spread / buyPrice) * 100 : 0);

    return {
      id: opp.id,
      symbol,
      buyExchange: buyVenue,
      sellExchange: sellVenue,
      buyPrice,
      sellPrice,
      spread,
      spreadPercent,
      timestamp: opp.timestamp ?? Date.now(),
      latency: 10,
    };
  }

  private async handleAdmittedOpportunity(opportunity: SpreadArbitrageOpportunity): Promise<void> {
    await this.executeOpportunity(opportunity);
  }

  /**
   * Execute an arbitrage opportunity end-to-end:
   * 1. Log opportunity ingestion into hash-chained audit log
   * 2. Pre-trade profit hurdle check
   * 3. Pre-trade risk gate evaluation (Quarter-Kelly, drawdown, latency, venue/symbol caps)
   * 4. Multi-leg atomic execution via AtomicMultiLegCoordinator
   * 5. Real-time Prometheus metrics recording
   * 6. Hash-chained audit logging for lifecycle outcome (fill, unwind, failure)
   */
  async executeOpportunity(opp: ArbitrageOpportunity): Promise<MultiLegExecutionReport | null> {
    const buyVenue = opp.buyVenue ?? opp.buyExchange ?? opp.venues?.[0] ?? opp.legs?.find((l) => l.side === 'buy')?.exchange ?? opp.legs?.find((l) => l.side === 'buy')?.venue ?? 'unknown';
    const sellVenue = opp.sellVenue ?? opp.sellExchange ?? opp.venues?.[1] ?? opp.legs?.find((l) => l.side === 'sell')?.exchange ?? opp.legs?.find((l) => l.side === 'sell')?.venue ?? 'unknown';
    const symbol = opp.symbol ?? opp.legs?.[0]?.symbol ?? 'BTC/USDT';
    const buyPrice = opp.buyPrice ?? opp.legs?.find((l) => l.side === 'buy')?.price ?? 0;
    const sellPrice = opp.sellPrice ?? opp.legs?.find((l) => l.side === 'sell')?.price ?? 0;
    const amount = opp.tradeSize ?? opp.maxTradeSize ?? opp.amount ?? opp.legs?.[0]?.amount ?? 1;

    // 1. Audit opportunity ingestion
    await this.auditLogger.logOpportunityIngested({
      id: opp.id,
      symbol,
      buyVenue,
      sellVenue,
      buyPrice,
      sellPrice,
      spreadBps: opp.spreadBps ?? (buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 10000 : 0),
      netProfitBps: opp.netProfitBps,
    });

    // 2. Pre-Trade Profit Hurdle Check
    const minHurdleBps = this.config.minNetProfitBps ?? this.config.riskConfig?.minHurdleBps ?? 10;
    const computedSpreadBps = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 10000 : 0;
    const effectiveNetProfitBps = opp.netProfitBps ?? computedSpreadBps;

    if (effectiveNetProfitBps < minHurdleBps) {
      await this.auditLogger.logRiskRejection({
        opportunityId: opp.id,
        rule: 'BELOW_PROFIT_HURDLE',
        reason: 'BELOW_PROFIT_HURDLE',
      });
      await this.auditLogger.logRiskRejected({
        opportunityId: opp.id,
        reason: `Net profit ${effectiveNetProfitBps} bps is below hurdle ${minHurdleBps} bps`,
        rule: 'BELOW_PROFIT_HURDLE',
        symbol,
      });
      recordArbOrder({
        strategyType: 'cross-exchange',
        venue: buyVenue,
        status: 'hurdle_rejected',
        mode: this.mode,
      });
      return null;
    }

    // 3. Pre-Trade Risk Gate Checks
    const rawNotional = amount * buyPrice;
    let buyLatency = 10;
    let sellLatency = 10;

    const buyConn = this.connectorResolver(buyVenue);
    const sellConn = this.connectorResolver(sellVenue);

    if (buyConn && 'getLatencyStats' in buyConn && typeof (buyConn as { getLatencyStats: unknown }).getLatencyStats === 'function') {
      const stats = (buyConn as { getLatencyStats: () => { p90?: number } }).getLatencyStats();
      if (typeof stats?.p90 === 'number') buyLatency = stats.p90;
    }
    if (sellConn && 'getLatencyStats' in sellConn && typeof (sellConn as { getLatencyStats: unknown }).getLatencyStats === 'function') {
      const stats = (sellConn as { getLatencyStats: () => { p90?: number } }).getLatencyStats();
      if (typeof stats?.p90 === 'number') sellLatency = stats.p90;
    }

    const riskCheck = await this.riskGuard.checkPreTrade({
      symbol,
      buyVenue,
      sellVenue,
      tradeNotionalUsd: rawNotional,
      bankrollUsd: this.riskGuard.getConfig().capitalUsdc ?? 100000,
      netProfitBps: effectiveNetProfitBps,
      currentDrawdown: 0,
      venueLatencies: {
        [buyVenue]: buyLatency,
        [sellVenue]: sellLatency,
      },
    });

    if (!riskCheck.allowed) {
      const reason = riskCheck.rejectionReason ?? 'Risk limit exceeded';
      await this.auditLogger.logRiskRejection({
        opportunityId: opp.id,
        reason,
        rule: reason,
      });
      await this.auditLogger.logRiskRejected({
        opportunityId: opp.id,
        reason,
        rule: reason,
        symbol,
      });
      recordArbOrder({
        strategyType: 'cross-exchange',
        venue: buyVenue,
        status: 'risk_rejected',
        mode: this.mode,
      });
      return null;
    }

    const adjustedNotional = riskCheck.adjustedNotionalUsd ?? 0;
    const sizedAmount =
      adjustedNotional > 0 && buyPrice > 0
        ? adjustedNotional / buyPrice
        : amount;

    // 4. Build multi-leg plan
    const plan: MultiLegArbitrageOrder = {
      orderId: `exec-${opp.id}-${Date.now()}`,
      opportunityId: opp.id,
      executionMode: 'concurrent',
      legs: [
        {
          legId: `leg-buy-${buyVenue}`,
          venue: buyVenue,
          symbol,
          side: 'buy',
          amount: sizedAmount,
          price: buyPrice,
          type: 'limit',
        },
        {
          legId: `leg-sell-${sellVenue}`,
          venue: sellVenue,
          symbol,
          side: 'sell',
          amount: sizedAmount,
          price: sellPrice,
          type: 'limit',
        },
      ],
    };

    // 5. Audit order submission
    await this.auditLogger.logOrderSubmitted({
      orderId: plan.orderId,
      opportunityId: plan.opportunityId,
      symbol,
      legsCount: plan.legs.length,
      totalNotionalUsd: sizedAmount * buyPrice,
      executionMode: plan.executionMode,
    });

    // 6. Coordinate execution with timeout & unwinds
    this.metrics.incActiveExecutions();
    this.activeExecutionCount++;
    this.lastExecutionTimestamp = Date.now();

    let report: MultiLegExecutionReport;
    try {
      report = await this.coordinator.execute(plan);
    } finally {
      this.metrics.decActiveExecutions();
      this.activeExecutionCount = Math.max(0, this.activeExecutionCount - 1);
    }

    // 7. Telemetry & Metric Recording
    for (const leg of report.legs) {
      this.metrics.recordOrder(leg.venue, leg.status, 'concurrent_arbitrage');
      this.metrics.recordExecutionLatency(leg.venue, 'concurrent_arbitrage', leg.latencyMs);
      recordArbOrder({
        strategyType: 'concurrent_arbitrage',
        venue: leg.venue,
        leg: leg.legId,
        side: leg.side,
        status: leg.status,
        mode: this.mode,
      });
      recordArbLatency({
        strategyType: 'concurrent_arbitrage',
        phase: 'leg_fill',
        status: leg.status,
        latencyMs: leg.latencyMs,
      });
    }

    if (report.netRealizedPnlUsd !== undefined) {
      this.metrics.recordPnl('concurrent_arbitrage', report.netRealizedPnlUsd);
      recordArbPnl({
        strategyType: 'concurrent_arbitrage',
        venuePair: `${buyVenue}-${sellVenue}`,
        result: report.netRealizedPnlUsd >= 0 ? 'win' : 'loss',
        pnlUsd: report.netRealizedPnlUsd,
      });
    }

    // 8. Audit Trail Outcome Logging
    if (report.state === 'FILLED') {
      await this.auditLogger.logOrderFilled(report);
      await this.auditLogger.logExecution(report);
    } else if (report.state === 'UNWOUND') {
      if (report.unwindResult) {
        this.metrics.recordUnwind(buyVenue, report.unwindResult.success);
        await this.auditLogger.logUnwind(report.executionId, report.unwindResult);
        await this.auditLogger.logOrderUnwound(report.unwindResult);
      }
      await this.auditLogger.logExecution(report);
    } else if (report.state === 'FAILED') {
      await this.auditLogger.logOrderFailed(report.executionId, report.error ?? 'Execution failed');
      await this.auditLogger.logExecution(report);
    }

    return report;
  }
}
