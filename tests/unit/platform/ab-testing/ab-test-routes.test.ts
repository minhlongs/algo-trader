/**
 * ab-test-routes — Unit Tests
 *
 * Tests Express routes for A/B experiment management.
 * Mocks ab-test-manager to isolate HTTP layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from 'express';
import request from 'supertest';
import { abTestRoutes } from '../../../../src/platform/ab-testing/ab-test-routes';

// Mock the manager module
const {
  mockCreateExperiment,
  mockStartExperiment,
  mockAssignGroup,
  mockRecordOutcome,
  mockGetResults,
  mockListExperiments,
} = vi.hoisted(() => ({
  mockCreateExperiment: vi.fn(),
  mockStartExperiment: vi.fn(),
  mockAssignGroup: vi.fn(),
  mockRecordOutcome: vi.fn(),
  mockGetResults: vi.fn(),
  mockListExperiments: vi.fn(),
}));

vi.mock('../../../../src/platform/ab-testing/ab-test-manager', () => ({
  createExperiment: mockCreateExperiment,
  startExperiment: mockStartExperiment,
  assignGroup: mockAssignGroup,
  recordOutcome: mockRecordOutcome,
  getResults: mockGetResults,
  listExperiments: mockListExperiments,
}));

function createTestApp() {
  const app = require('express')();
  app.use(require('express').json());
  app.use('/api/v1/ab-test', abTestRoutes);
  return app;
}

describe('ab-test-routes', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('GET /experiments', () => {
    it('returns list of experiments', async () => {
      mockListExperiments.mockResolvedValueOnce([
        { id: 1, name: 'exp-1', status: 'running', controlName: 'A', treatmentName: 'B' },
        { id: 2, name: 'exp-2', status: 'draft', controlName: 'C', treatmentName: 'D' },
      ]);

      const res = await request(app).get('/api/v1/ab-test/experiments').expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('exp-1');
      expect(res.body[1].name).toBe('exp-2');
      expect(mockListExperiments).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no experiments', async () => {
      mockListExperiments.mockResolvedValueOnce([]);

      const res = await request(app).get('/api/v1/ab-test/experiments').expect(200);

      expect(res.body).toEqual([]);
    });

    it('propagates database errors', async () => {
      mockListExperiments.mockRejectedValueOnce(new Error('db connection failed'));

      await request(app).get('/api/v1/ab-test/experiments').expect(500);
    });
  });

  describe('POST /experiments', () => {
    it('creates experiment with all fields', async () => {
      mockCreateExperiment.mockResolvedValueOnce({
        id: 1,
        name: 'Test Experiment',
        controlName: 'Control',
        treatmentName: 'Treatment',
        description: 'Test desc',
        status: 'draft',
      });

      const res = await request(app)
        .post('/api/v1/ab-test/experiments')
        .send({ name: 'Test Experiment', controlName: 'Control', treatmentName: 'Treatment', description: 'Test desc' })
        .expect(201);

      expect(res.body.name).toBe('Test Experiment');
      expect(res.body.controlName).toBe('Control');
      expect(res.body.treatmentName).toBe('Treatment');
      expect(mockCreateExperiment).toHaveBeenCalledWith({
        name: 'Test Experiment',
        controlName: 'Control',
        treatmentName: 'Treatment',
        description: 'Test desc',
      });
    });

    it('creates experiment with minimal fields (defaults trafficPct, minSamples, confidenceLevel)', async () => {
      mockCreateExperiment.mockResolvedValueOnce({
        id: 1,
        name: 'Min Experiment',
        controlName: 'A',
        treatmentName: 'B',
        description: null,
        status: 'draft',
      });

      const res = await request(app)
        .post('/api/v1/ab-test/experiments')
        .send({ name: 'Min Experiment', controlName: 'A', treatmentName: 'B' })
        .expect(201);

      expect(res.body.name).toBe('Min Experiment');
      expect(mockCreateExperiment).toHaveBeenCalledWith({
        name: 'Min Experiment',
        controlName: 'A',
        treatmentName: 'B',
        description: undefined,
      });
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/v1/ab-test/experiments')
        .send({ controlName: 'A', treatmentName: 'B' })
        .expect(400);

      expect(res.body.error).toBe('name, controlName, treatmentName required');
      expect(mockCreateExperiment).not.toHaveBeenCalled();
    });

    it('returns 400 when controlName is missing', async () => {
      const res = await request(app)
        .post('/api/v1/ab-test/experiments')
        .send({ name: 'Test', treatmentName: 'B' })
        .expect(400);

      expect(res.body.error).toBe('name, controlName, treatmentName required');
    });

    it('returns 400 when treatmentName is missing', async () => {
      const res = await request(app)
        .post('/api/v1/ab-test/experiments')
        .send({ name: 'Test', controlName: 'A' })
        .expect(400);

      expect(res.body.error).toBe('name, controlName, treatmentName required');
    });

    it('propagates database errors on create', async () => {
      mockCreateExperiment.mockRejectedValueOnce(new Error('duplicate name'));

      await request(app)
        .post('/api/v1/ab-test/experiments')
        .send({ name: 'Test', controlName: 'A', treatmentName: 'B' })
        .expect(500);
    });
  });

  describe('POST /experiments/:id/start', () => {
    it('starts experiment and returns ok', async () => {
      mockStartExperiment.mockResolvedValueOnce({
        id: 1,
        name: 'Test',
        status: 'running',
        controlName: 'A',
        treatmentName: 'B',
      });

      const res = await request(app)
        .post('/api/v1/ab-test/experiments/1/start')
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(mockStartExperiment).toHaveBeenCalledWith(1);
    });

    it('returns 400 for invalid id (non-numeric)', async () => {
      const res = await request(app)
        .post('/api/v1/ab-test/experiments/abc/start')
        .expect(400);

      expect(res.body.error).toBe('Invalid experiment id');
      expect(mockStartExperiment).not.toHaveBeenCalled();
    });

    it('propagates errors from startExperiment', async () => {
      mockStartExperiment.mockRejectedValueOnce(new Error('not in draft status'));

      await request(app)
        .post('/api/v1/ab-test/experiments/1/start')
        .expect(500);
    });
  });

  describe('POST /experiments/:id/assign', () => {
    it('assigns signal to group and returns group name', async () => {
      mockAssignGroup.mockResolvedValueOnce({ group: 'treatment', alreadyAssigned: false });

      const res = await request(app)
        .post('/api/v1/ab-test/experiments/1/assign')
        .send({ signalId: 'signal-123' })
        .expect(200);

      expect(res.body.group.group).toBe('treatment');
      expect(mockAssignGroup).toHaveBeenCalledWith(1, 'signal-123');
    });

    it('returns alreadyAssigned true when signal already assigned', async () => {
      mockAssignGroup.mockResolvedValueOnce({ group: 'control', alreadyAssigned: true });

      const res = await request(app)
        .post('/api/v1/ab-test/experiments/1/assign')
        .send({ signalId: 'signal-456' })
        .expect(200);

      expect(res.body.group.group).toBe('control');
      expect(mockAssignGroup).toHaveBeenCalledWith(1, 'signal-456');
    });

    it('returns 400 for invalid experiment id', async () => {
      const res = await request(app)
        .post('/api/v1/ab-test/experiments/xyz/assign')
        .send({ signalId: 'signal-123' })
        .expect(400);

      expect(res.body.error).toBe('Invalid experiment id');
    });

    it('returns 400 when signalId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/ab-test/experiments/1/assign')
        .send({})
        .expect(400);

      expect(res.body.error).toBe('signalId required');
    });

    it('propagates database errors', async () => {
      mockAssignGroup.mockRejectedValueOnce(new Error('experiment not found'));

      await request(app)
        .post('/api/v1/ab-test/experiments/1/assign')
        .send({ signalId: 'signal-123' })
        .expect(500);
    });
  });

  describe('POST /experiments/:id/outcomes', () => {
    it('records outcome with all fields', async () => {
      mockRecordOutcome.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/v1/ab-test/experiments/1/outcomes')
        .send({
          signalId: 'signal-123',
          group: 'treatment',
          correct: true,
          confidence: 0.95,
          pnl: 10.5,
          metadata: { source: 'ml' },
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(mockRecordOutcome).toHaveBeenCalledWith(
        1,
        'signal-123',
        'treatment',
        true,
        0.95,
        10.5,
        { source: 'ml' },
      );
    });

    it('records outcome with minimal fields (confidence, pnl, metadata optional)', async () => {
      mockRecordOutcome.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/v1/ab-test/experiments/1/outcomes')
        .send({
          signalId: 'signal-123',
          group: 'control',
          correct: false,
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(mockRecordOutcome).toHaveBeenCalledWith(
        1,
        'signal-123',
        'control',
        false,
        undefined,
        undefined,
        undefined,
      );
    });

    it('returns 400 for invalid experiment id', async () => {
      const res = await request(app)
        .post('/api/v1/ab-test/experiments/abc/outcomes')
        .send({ signalId: 's1', group: 'treatment', correct: true })
        .expect(400);

      expect(res.body.error).toBe('Invalid experiment id');
    });

    it('returns 400 when signalId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/ab-test/experiments/1/outcomes')
        .send({ group: 'treatment', correct: true })
        .expect(400);

      expect(res.body.error).toBe('Valid experiment id, signalId, group required');
    });

    it('returns 400 when group is missing', async () => {
      const res = await request(app)
        .post('/api/v1/ab-test/experiments/1/outcomes')
        .send({ signalId: 's1', correct: true })
        .expect(400);

      expect(res.body.error).toBe('Valid experiment id, signalId, group required');
    });

    it('propagates database errors', async () => {
      mockRecordOutcome.mockRejectedValueOnce(new Error('duplicate outcome'));

      await request(app)
        .post('/api/v1/ab-test/experiments/1/outcomes')
        .send({ signalId: 's1', group: 'treatment', correct: true })
        .expect(500);
    });
  });

  describe('GET /experiments/:id/results', () => {
    it('returns results with significance', async () => {
      mockGetResults.mockResolvedValueOnce({
        experiment: { id: 1, name: 'Test', status: 'completed' },
        control: { name: 'control', total: 100, correct: 60, accuracy: 0.6, avgConfidence: 0.7, avgPnl: 5 },
        treatment: { name: 'treatment', total: 100, correct: 75, accuracy: 0.75, avgConfidence: 0.8, avgPnl: 8 },
        pValue: 0.02,
        significant: true,
        winner: 'treatment',
        recommendation: 'Significant: treatment group outperforms...',
      });

      const res = await request(app)
        .get('/api/v1/ab-test/experiments/1/results')
        .expect(200);

      expect(res.body.pValue).toBe(0.02);
      expect(res.body.significant).toBe(true);
      expect(res.body.winner).toBe('treatment');
      expect(mockGetResults).toHaveBeenCalledWith(1);
    });

    it('returns results when not significant', async () => {
      mockGetResults.mockResolvedValueOnce({
        experiment: { id: 1, name: 'Test', status: 'running' },
        control: { name: 'control', total: 50, correct: 25, accuracy: 0.5, avgConfidence: 0.6, avgPnl: 2 },
        treatment: { name: 'treatment', total: 50, correct: 27, accuracy: 0.54, avgConfidence: 0.6, avgPnl: 3 },
        pValue: 0.45,
        significant: false,
        winner: null,
        recommendation: 'No statistically significant difference detected...',
      });

      const res = await request(app)
        .get('/api/v1/ab-test/experiments/1/results')
        .expect(200);

      expect(res.body.significant).toBe(false);
      expect(res.body.winner).toBeNull();
    });

    it('returns 400 for invalid experiment id', async () => {
      const res = await request(app)
        .get('/api/v1/ab-test/experiments/xyz/results')
        .expect(400);

      expect(res.body.error).toBe('Invalid experiment id');
    });

    it('propagates errors (e.g. experiment not found)', async () => {
      mockGetResults.mockRejectedValueOnce(new Error('Experiment 999 not found'));

      await request(app)
        .get('/api/v1/ab-test/experiments/999/results')
        .expect(500);
    });
  });
});