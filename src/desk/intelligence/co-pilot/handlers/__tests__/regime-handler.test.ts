/**
 * Tests for regime-handler — handleRegimeQuery.
 *
 * detectRegime and fuseSignals are mocked; logger is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockDetectRegime, mockFuseSignals } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockDetectRegime: vi.fn(),
  mockFuseSignals: vi.fn(),
}));

vi.mock('../../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../../strategies/dna/regime-detector', () => ({
  detectRegime: mockDetectRegime,
}));
vi.mock('../../../../intelligence/signal-fusion-engine', () => ({
  fuseSignals: mockFuseSignals,
}));

import { handleRegimeQuery } from '../regime-handler';

function makeIndicators() {
  return new Map([
    ['1h' as never, { trend: { adx: 25.5, adxTrend: 'UP' } } as never],
    ['4h' as never, { trend: { adx: 30.0, adxTrend: 'DOWN' } } as never],
  ]);
}

describe('handleRegimeQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFuseSignals.mockReturnValue({ direction: 'NEUTRAL', confidence: 0, weightedScore: 0, signals: [], reasoning: '' });
  });

  it('returns a CopilotResponse with answer and actions', async () => {
    mockDetectRegime.mockReturnValue({
      regime: 'trend', regimeConfidence: 0.72, dominantTf: '4h', reason: 'strong trend',
    });
    const res = await handleRegimeQuery({}, { indicatorsByTf: makeIndicators() });
    expect(res.answer).toContain('**Market Regime**');
    expect(res.actions).toHaveLength(2);
    expect(res.sourceData).toEqual(
      expect.objectContaining({
        regime: 'trend',
        confidence: 0.72,
        signalDirection: 'NEUTRAL',
        signalConfidence: 0,
        tfAnalysis: expect.arrayContaining([
          '1h: ADX=25.5 UP',
          '4h: ADX=30.0 DOWN',
        ]),
      }),
    );
  });

  it('builds an empty regime when no indicators are provided', async () => {
    const res = await handleRegimeQuery();
    expect(mockDetectRegime).not.toHaveBeenCalled();
    expect(res.answer).toContain('Regime: unknown (no data)');
    expect(res.answer).toContain('Regime confidence: 0%');
    expect(res.answer).toContain('Dominant TF: N/A');
    expect(res.sourceData.regime).toBe('unknown (no data)');
  });

  it('calls detectRegime with the provided indicators and now', async () => {
    mockDetectRegime.mockReturnValue({ regime: 'chop', regimeConfidence: 0.4, dominantTf: '1h', reason: '' });
    const indicators = makeIndicators();
    await handleRegimeQuery({ strategyId: 's' }, { indicatorsByTf: indicators });
    expect(mockDetectRegime).toHaveBeenCalledWith(indicators, expect.any(Number));
  });

  it('fuses signals from the detected regime when one exists', async () => {
    mockDetectRegime.mockReturnValue({ regime: 'trend', regimeConfidence: 0.8, dominantTf: '4h', reason: '' });
    mockFuseSignals.mockReturnValue({ direction: 'UP', confidence: 0.6, weightedScore: 0.6, signals: [], reasoning: '' });
    const res = await handleRegimeQuery({}, { indicatorsByTf: makeIndicators() });
    expect(mockFuseSignals).toHaveBeenCalledWith([
      { name: 'trend', score: 0.8, weight: 1 },
    ]);
    expect(res.answer).toContain('Fused signal: UP (confidence: 60%)');
    expect(res.sourceData.signalDirection).toBe('UP');
    expect(res.sourceData.signalConfidence).toBe(0.6);
  });

  it('fuses empty signals when no regime is detected', async () => {
    await handleRegimeQuery();
    expect(mockFuseSignals).toHaveBeenCalledWith([]);
  });

  it('renders per-TF analysis lines when indicators are provided', async () => {
    mockDetectRegime.mockReturnValue({ regime: 'trend', regimeConfidence: 0.5, dominantTf: '1h', reason: '' });
    await handleRegimeQuery({ strategyId: 's' }, { indicatorsByTf: makeIndicators() });
    const res = await handleRegimeQuery({}, { indicatorsByTf: makeIndicators() });
    expect(res.answer).toContain('**Per-TF Analysis:**');
    expect(res.answer).toContain('- 1h: ADX=25.5 UP');
    expect(res.answer).toContain('- 4h: ADX=30.0 DOWN');
    expect(res.sourceData.tfAnalysis).toEqual(['1h: ADX=25.5 UP', '4h: ADX=30.0 DOWN']);
  });

  it('omits the per-TF section when there are no indicators', async () => {
    const res = await handleRegimeQuery();
    expect(res.answer).not.toContain('**Per-TF Analysis:**');
  });

  it('includes the reason line when the regime snapshot has one', async () => {
    mockDetectRegime.mockReturnValue({ regime: 'trend', regimeConfidence: 0.5, dominantTf: '1h', reason: 'macro strong' });
    const res = await handleRegimeQuery({}, { indicatorsByTf: makeIndicators() });
    expect(res.answer).toContain('**Reason:** macro strong');
  });

  it('omits the reason line when the regime snapshot has none', async () => {
    mockDetectRegime.mockReturnValue({ regime: 'trend', regimeConfidence: 0.5, dominantTf: '1h', reason: '' });
    const res = await handleRegimeQuery({}, { indicatorsByTf: makeIndicators() });
    expect(res.answer).not.toContain('**Reason:**');
  });

  it('formats regime confidence as a percentage', async () => {
    mockDetectRegime.mockReturnValue({ regime: 'trend', regimeConfidence: 0.666, dominantTf: '1h', reason: '' });
    const res = await handleRegimeQuery({}, { indicatorsByTf: makeIndicators() });
    expect(res.answer).toContain('Regime confidence: 67%');
    expect(res.sourceData.confidence).toBeCloseTo(0.666, 3);
  });
});
