/**
 * Test fixtures and utilities for Compliance Routes tests
 */

import { vi } from 'vitest';
import express from 'express';

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { complianceRouter } from '../routes/compliance-routes';

export function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(complianceRouter);
  return app;
}
