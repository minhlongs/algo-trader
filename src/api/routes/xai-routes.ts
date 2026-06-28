/**
 * XAI (Explainable AI) API Routes
 *
 * Proxies requests to the AlphaEar Intelligence Python sidecar.
 * Provides model explanations, feature importance, counterfactuals, and strategy rules.
 *
 * Base URL: /api/v1/xai
 * Endpoints:
 *   POST   /explain              - Generate explanation for a prediction
 *   GET    /explanation/:id      - Retrieve stored explanation
 *   GET    /feature-importance   - Get aggregated feature importance
 *   POST   /counterfactual       - Generate counterfactual scenarios
 *   POST   /strategy-rules       - Extract rules from strategy code
 *   GET    /dashboard/overview   - XAI dashboard summary data
 *   GET    /health               - XAI service health check
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { AlphaEarClient } from '../../intelligence/alphaear-client.js';

const router: Router = Router();
const alphaear = new AlphaEarClient(process.env.ALPHAEAR_SIDECAR_URL);

// ──── Zod Schemas ────

const explainPredictionSchema = z.object({
  model_type: z.enum(['rl', 'kronos', 'strategy']),
  features: z.object({}).catchall(z.number()),
  prediction: z.number(),
  trade_id: z.string(),
  generate_visualizations: z.boolean().default(true),
});

const counterfactualSchema = z.object({
  features: z.object({}).catchall(z.number()),
  prediction: z.number(),
  model_type: z.enum(['rl', 'kronos', 'strategy']),
  target_outcome: z.number().optional(),
  constraints: z.object({}).catchall(
    z.object({
      min: z.number(),
      max: z.number(),
    })
  ).optional(),
  n_counterfactuals: z.number().int().min(1).max(10).default(5),
});

const strategyRulesSchema = z.object({
  strategy_code: z.string(),
  strategy_name: z.string(),
  use_llm: z.boolean().default(true),
});

// ──── Types ────

interface ExplanationResponse {
  explanation: {
    trade_id: string;
    model_type: string;
    prediction: number;
    feature_importance: Record<string, number>;
    shap_values?: Record<string, number>;
    lime_values?: Record<string, number>;
    rationale: string;
    counterfactuals?: Array<{
      feature: string;
      current_value: number;
      counterfactual_value: number;
      required_change: number;
      would_flip_prediction_to: number;
      description: string;
    }>;
    confidence: number;
    generated_at: string;
    visualizations?: Array<{
      chart_type: string;
      data: Record<string, unknown>;
      layout?: Record<string, unknown>;
    }>;
  };
  summary: string;
  top_features: Array<{ name: string; importance: number }>;
  visualizations?: Array<{
    chart_type: string;
    data: Record<string, unknown>;
    layout?: Record<string, unknown>;
  }>;
}

interface FeatureImportanceResponse {
  model_type: string;
  features: Array<{
    name: string;
    importance: number;
    description?: string;
  }>;
  generated_at: string;
  metadata?: Record<string, unknown>;
}

interface StrategyRulesResponse {
  strategy_name: string;
  rules: Array<{
    rule_id: string;
    type: string;
    indicator?: string;
    condition: string;
    action?: string;
    description: string;
    line_number?: number;
  }>;
  num_rules: number;
  extraction_method: string;
}

interface CounterfactualResponse {
  original_prediction: number;
  original_features: Record<string, number>;
  counterfactuals: Array<{
    feature: string;
    current_value: number;
    counterfactual_value: number;
    required_change: number;
    would_flip_prediction_to: number;
    description: string;
  }>;
  num_generated: number;
  constraints_applied: boolean;
}

// ──── Middleware ────

/**
 * XAI rate limiting: 30 requests/minute per IP
 */
const xaiRateLimit = (req: Request, res: Response, next: NextFunction) => {
  // TODO: Implement proper rate limiting with Redis
  // For now, just pass through
  next();
};

// ──── Endpoints ────

/**
 * POST /api/v1/xai/explain
 * Generate explanation for a model prediction
 */
router.post('/explain', xaiRateLimit, async (req: Request, res: Response) => {
  try {
    const validated = explainPredictionSchema.parse(req.body);

    // Cast to satisfy TypeScript inference quirks
    const features = validated.features as Record<string, number>;

    const response = await alphaear.explainPrediction({
      model_type: validated.model_type,
      features: features,
      prediction: validated.prediction ?? 0,
      trade_id: validated.trade_id ?? '',
      generate_visualizations: validated.generate_visualizations,
    });

    if (!response) {
      logger.warn('[XAI] Explanation request failed - sidecar unavailable', {
        model_type: validated.model_type,
        trade_id: validated.trade_id,
      });
      return res.status(503).json({
        error: 'XAI service temporarily unavailable',
        message: 'Explanation generation failed. The XAI sidecar may be down.',
      });
    }

    res.json({
      explanation: response,
      summary: `Prediction: ${response.prediction.toFixed(4)}. ` +
        `Top factors: ${Object.entries(response.feature_importance)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([k, v]) => `${k} (${(v * 100).toFixed(1)}%)`)
          .join(', ')}. ` +
        `Confidence: ${(response.confidence * 100).toFixed(1)}%`,
      top_features: Object.entries(response.feature_importance)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([name, importance]) => ({ name, importance })),
      visualizations: response.visualizations,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('[XAI] Invalid request', { issues: error.issues });
      return res.status(400).json({
        error: 'Invalid request',
        details: error.issues,
      });
    }

    logger.error('[XAI] Explanation failed', { error });
    res.status(500).json({
      error: 'Explanation generation failed',
      message: 'An unexpected error occurred while generating the explanation.',
    });
  }
});

/**
 * GET /api/v1/xai/explanation/:explanationId
 * Retrieve stored explanation by trade ID
 */
router.get('/explanation/:explanationId', async (req: Request, res: Response) => {
  const { explanationId } = req.params;

  try {
    // In production, would retrieve from database via XAI repository
    // For now, return 501 Not Implemented
    res.status(501).json({
      error: 'Not implemented',
      message: 'Retrieving stored explanations by ID requires database persistence layer.',
    });
  } catch (error) {
    logger.error('[XAI] Failed to retrieve explanation', { explanationId, error });
    res.status(500).json({
      error: 'Failed to retrieve explanation',
    });
  }
});

/**
 * GET /api/v1/xai/feature-importance
 * Get aggregated feature importance for a model type
 */
router.get('/feature-importance', async (req: Request, res: Response) => {
  try {
    const modelType = req.query.model_type as string;
    const limit = parseInt(req.query.limit as string, 10) || 10;

    if (!['rl', 'kronos', 'strategy'].includes(modelType)) {
      return res.status(400).json({
        error: 'Invalid model_type',
        valid_values: ['rl', 'kronos', 'strategy'],
      });
    }

    const response = await alphaear.getFeatureImportance(modelType as 'rl' | 'kronos' | 'strategy', limit);

    if (!response) {
      return res.status(503).json({
        error: 'XAI service temporarily unavailable',
      });
    }

    res.json({
      model_type: response.model_type,
      features: response.features,
      generated_at: response.generated_at,
      metadata: response.metadata,
    });
  } catch (error) {
    logger.error('[XAI] Feature importance query failed', { error });
    res.status(500).json({
      error: 'Feature importance query failed',
    });
  }
});

/**
 * POST /api/v1/xai/counterfactual
 * Generate counterfactual explanations
 */
router.post('/counterfactual', xaiRateLimit, async (req: Request, res: Response) => {
  try {
    const validated = counterfactualSchema.parse(req.body);

    // Cast to satisfy TypeScript
    const features = validated.features as Record<string, number>;
    const constraints = validated.constraints as
      | Record<string, { min: number; max: number }>
      | undefined;

    const response = await alphaear.generateCounterfactuals({
      features: features,
      prediction: validated.prediction,
      model_type: validated.model_type,
      target_outcome: validated.target_outcome,
      constraints: constraints,
      n_counterfactuals: validated.n_counterfactuals,
    });

    if (!response) {
      return res.status(503).json({
        error: 'XAI service temporarily unavailable',
      });
    }

    res.json({
      original_prediction: response.original_prediction,
      original_features: response.original_features,
      counterfactuals: response.counterfactuals,
      num_generated: response.num_generated,
      constraints_applied: response.constraints_applied,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request',
        details: error.issues,
      });
    }

    logger.error('[XAI] Counterfactual generation failed', { error });
    res.status(500).json({
      error: 'Counterfactual generation failed',
    });
  }
});

/**
 * POST /api/v1/xai/strategy-rules
 * Extract human-readable rules from strategy code
 */
router.post('/strategy-rules', xaiRateLimit, async (req: Request, res: Response) => {
  try {
    const validated = strategyRulesSchema.parse(req.body);

    const response = await alphaear.extractStrategyRules({
      strategy_code: validated.strategy_code,
      strategy_name: validated.strategy_name,
      use_llm: validated.use_llm,
    });

    if (!response) {
      return res.status(503).json({
        error: 'XAI service temporarily unavailable',
      });
    }

    res.json({
      strategy_name: response.strategy_name,
      rules: response.rules,
      num_rules: response.num_rules,
      extraction_method: response.extraction_method,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request',
        details: error.issues,
      });
    }

    logger.error('[XAI] Strategy rule extraction failed', { error });
    res.status(500).json({
      error: 'Strategy rule extraction failed',
    });
  }
});

/**
 * GET /api/v1/xai/dashboard/overview
 * Get XAI dashboard summary data (aggregated statistics)
 */
router.get('/dashboard/overview', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string, 10) || 7;

    // TODO: Implement aggregation from database when persistence is enabled
    res.json({
      period_days: days,
      total_explanations: 0,
      avg_confidence: 0.0,
      most_important_features: [
        { name: 'RSI', avg_importance: 0.25 },
        { name: 'MACD', avg_importance: 0.20 },
        { name: 'Volume', avg_importance: 0.15 },
      ],
      common_rationales: [
        'RSI oversold + positive sentiment',
        'MACD bullish crossover',
        'Volume spike with price breakout',
      ],
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[XAI] Dashboard overview query failed', { error });
    res.status(500).json({
      error: 'Dashboard overview query failed',
    });
  }
});

/**
 * GET /api/v1/xai/health
 * Health check for XAI service (proxies to sidecar)
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await alphaear.checkHealth();

    if (!health) {
      return res.status(503).json({
        status: 'unavailable',
        sidecar_accessible: false,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      status: 'healthy',
      sidecar_accessible: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[XAI] Health check failed', { error });
    res.status(503).json({
      status: 'unavailable',
      error: 'Failed to reach XAI sidecar',
      timestamp: new Date().toISOString(),
    });
  }
});

// ──── Export ────

export default router;
