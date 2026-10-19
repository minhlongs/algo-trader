/**
 * Automated Multi-Exchange Arbitrage Execution Engine.
 *
 * Master orchestrator integrating OpportunityIngestionPipeline, NetProfitabilityCalculator,
 * ArbitrageRiskGuard, AtomicMultiLegCoordinator, ArbitrageMetrics, and ArbitrageAuditLogger.
 *
 * @module desk/arbitrage/arbitrage-engine
 */

import { logger } from '../../shared/utils/logger';
import type { IExchangeConnector } from './connectors/types';
import { OpportunityIngestionPipeline } from './opportunity-ingestion-pipeline';
import type { ArbitrageOpportunity as SpreadArbitrageOpportunity } from './spread-detector-types';
import { NetProfitabilityCalculator } from './net-profitability-calculator';
import { ArbitrageRiskGuard } from './arbitrage-risk-guard';
import { AtomicMultiLegCoordinator } from './atomic-multileg-coordinator';
import type { MultiLegExecutionReport } from './execution-types';
import { ArbitrageMetrics } from './arbitrage-metrics';
import { ArbitrageAuditLogger } from './telemetry/arbitrage-audit-logger';
import {
  type ArbitrageEngineConfig,
  type ArbitrageOpportunity,
  type ArbitrageEngineStatus,
} from './engine/arbitrage-engine-types';
import { normalizeSpreadOpportunity } from './engine/arbitrage-engine-normalizer';
import { runOpportunityExecutionFlow } from './engine/arbitrage-execution-flow';

export * from './engine/arbitrage-engine-types';

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
    this.coordinator = new AtomicMultiLegCoordinator(this.connectorResolver);

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
          await this.executeOpportunity(opp);
        },
      },
    );

    const pipelineObj = this.ingestionPipeline as unknown as Record<string, unknown>;
    pipelineObj.ingest = (opp: ArbitrageOpportunity) => {
      this.submitOpportunity(opp);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.ingestionPipeline.start();
    logger.info('[ArbitrageEngine] Started arbitrage execution engine', { mode: this.mode });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.ingestionPipeline.stop();
    logger.info('[ArbitrageEngine] Stopped arbitrage execution engine');
  }

  isRunning(): boolean {
    return this.running;
  }

  getMode(): 'dry-run' | 'live' {
    return this.mode;
  }

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

  submitOpportunity(opportunity: ArbitrageOpportunity): void {
    const norm = normalizeSpreadOpportunity(opportunity);
    this.ingestionPipeline.handleOpportunities([norm]);
  }

  async executeOpportunity(opp: ArbitrageOpportunity): Promise<MultiLegExecutionReport | null> {
    return runOpportunityExecutionFlow({
      opp,
      config: this.config,
      mode: this.mode,
      metrics: this.metrics,
      auditLogger: this.auditLogger,
      riskGuard: this.riskGuard,
      profitabilityCalc: this.profitabilityCalc,
      coordinator: this.coordinator,
      connectorResolver: this.connectorResolver,
      onExecutionStart: () => {
        this.metrics.incActiveExecutions();
        this.activeExecutionCount++;
        this.lastExecutionTimestamp = Date.now();
      },
      onExecutionEnd: () => {
        this.metrics.decActiveExecutions();
        this.activeExecutionCount = Math.max(0, this.activeExecutionCount - 1);
      },
    });
  }
}
