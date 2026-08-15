/**
 * A/B Test API Routes (Express Router)
 *
 * REST endpoints for managing experiments, recording outcomes,
 * and retrieving results. Mounted at /api/v1/ab-test.
 */

import { Router } from 'express';
import {
  createExperiment, startExperiment, assignGroup,
  recordOutcome, getResults, listExperiments,
} from './ab-test-manager';

const abTestRoutes: import('express').Router = Router();

/** GET /experiments — list all experiments */
abTestRoutes.get('/experiments', async (_req, res) => {
  const experiments = await listExperiments();
  res.json(experiments);
});

/** POST /experiments — create a new experiment */
abTestRoutes.post('/experiments', async (req, res) => {
  const { name, controlName, treatmentName, description } = req.body;
  if (!name || !controlName || !treatmentName) {
    return res.status(400).json({ error: 'name, controlName, treatmentName required' });
  }
  const experiment = await createExperiment({ name, controlName, treatmentName, description });
  res.status(201).json(experiment);
});

/** POST /experiments/:id/start — activate an experiment */
abTestRoutes.post('/experiments/:id/start', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid experiment id' });
  await startExperiment(id);
  res.json({ ok: true });
});

/** POST /experiments/:id/assign — assign a signal to a group */
abTestRoutes.post('/experiments/:id/assign', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { signalId } = req.body;
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid experiment id' });
  if (!signalId) return res.status(400).json({ error: 'signalId required' });
  const group = await assignGroup(id, signalId);
  res.json({ group });
});

/** POST /experiments/:id/outcomes — record an outcome */
abTestRoutes.post('/experiments/:id/outcomes', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { signalId, group, correct, confidence, pnl, metadata } = req.body;
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid experiment id' });
  if (!signalId || !group) return res.status(400).json({ error: 'Valid experiment id, signalId, group required' });
  await recordOutcome(id, signalId, group, correct, confidence, pnl, metadata);
  res.json({ ok: true });
});

/** GET /experiments/:id/results — get significance results */
abTestRoutes.get('/experiments/:id/results', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid experiment id' });
  const results = await getResults(id);
  res.json(results);
});

export { abTestRoutes };
