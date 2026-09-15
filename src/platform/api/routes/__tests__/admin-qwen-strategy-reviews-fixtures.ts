import express, { type Express, type Router } from 'express';

export const ADMIN_KEY = 'test-admin-key-abc';

export const SAMPLE_REVIEW = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  source: 'qwen-m1max',
  trigger_reason: 'win_rate_below_threshold',
  metrics: { winRate: 0.3, sharpe: null, signalCount: 25, closedTradeCount: 20 },
  status: 'pending',
  created_at: '2026-04-17T10:00:00Z',
  resolved_at: null,
};

export function buildAdminQwenApp(router: Router): Express {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const app = express();
  app.use(express.json());
  app.use('/qwen', router);
  return app;
}
