/**
 * Shared fixtures for audit-trail-e2e tests.
 *
 * Exports:
 *  - buildApp(middleware): express.Application factory
 *  - defaultMockQueryImpl(sql: string): default mock implementation body
 */

import express from 'express';

export function buildApp(auditMiddleware: express.RequestHandler): express.Application {
  const app = express();
  app.use(express.json());
  app.use(auditMiddleware);

  // Simulated API routes
  app.get('/api/test/success', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/test/forbidden', (_req, res) => {
    res.status(403).json({ error: 'forbidden' });
  });

  app.post('/api/test/create', (req, res) => {
    res.status(201).json({ created: true, body: req.body });
  });

  app.get('/api/test/server-error', (_req, res) => {
    res.status(500).json({ error: 'internal' });
  });

  return app;
}

export function defaultMockQueryImpl(sql: string) {
  if (sql.includes('pg_advisory_xact_lock')) return { rows: [], command: 'SELECT' };
  if (sql.includes('MAX(sequence_number)')) return { rows: [{ next_seq: 1 }], command: 'SELECT' };
  if (sql.includes('SELECT hash FROM audit_log')) return { rows: [], command: 'SELECT' };
  if (sql.includes('INSERT INTO audit_log')) return { rows: [], command: 'INSERT' };
  return { rows: [], command: 'SELECT' };
}
