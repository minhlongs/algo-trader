/**
 * Personalization & A/B Testing Configuration and Widget Schemas
 */

import type { Router } from 'express';
import { z } from 'zod';

export type ExpressRouterType = Router;

export const TIER_SCHEMA = z.enum(['FREE', 'PRO', 'ENTERPRISE']);

export const configQuerySchema = z.object({
  tier: TIER_SCHEMA.default('FREE'),
});

export const abConfigQuerySchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
});

/** Deterministically assign A/B variant from tenantId */
export function assignVariant(tenantId: string): 'A' | 'B' {
  let hash = 0;
  for (let i = 0; i < tenantId.length; i++) {
    hash = ((hash << 5) - hash) + tenantId.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % 2 === 0 ? 'A' : 'B';
}

/** Widget configurations per tier */
export function getWidgetConfig(tier: 'FREE' | 'PRO' | 'ENTERPRISE') {
  const baseWidgets = [
    { id: 'price-ticker', colSpan: 12, visible: true },
    { id: 'candlestick', colSpan: 8, visible: true },
    { id: 'strategy-controls', colSpan: 4, visible: true },
  ];

  if (tier === 'FREE') {
    return {
      widgets: baseWidgets,
      features: {
        aiInsights: false,
        unlimitedStrategies: false,
        customAlerts: false,
      },
    };
  }

  if (tier === 'PRO') {
    return {
      widgets: [
        ...baseWidgets,
        { id: 'pnl-analytics', colSpan: 12, visible: true },
        { id: 'active-positions', colSpan: 6, visible: true },
      ],
      features: {
        aiInsights: true,
        unlimitedStrategies: true,
        customAlerts: false,
      },
    };
  }

  // ENTERPRISE
  return {
    widgets: [
      ...baseWidgets,
      { id: 'pnl-analytics', colSpan: 12, visible: true },
      { id: 'active-positions', colSpan: 6, visible: true },
      { id: 'ai-insights-panel', colSpan: 12, visible: true },
    ],
    features: {
      aiInsights: true,
      unlimitedStrategies: true,
      customAlerts: true,
    },
  };
}
