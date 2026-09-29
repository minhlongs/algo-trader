import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scanCycleEndOpportunities,
  fetchAndScanCycleEnd,
  isInEntryWindow,
  type CycleEndSignal,
} from '../../../../../src/desk/strategies/polymarket/cycle-end-sniper';
import { logger } from '../../../../../src/shared/utils/logger';

describe('CycleEndSniper Strategy', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'debug').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('scanCycleEndOpportunities', () => {
    it('returns empty array when market list is empty', () => {
      const res = scanCycleEndOpportunities([]);
      expect(res).toEqual([]);
    });

    it('skips closed markets and inactive markets', () => {
      const now = Date.now();
      const in2Min = new Date(now + 2 * 60 * 1000).toISOString();
      const res = scanCycleEndOpportunities([
        {
          conditionId: 'cond-closed',
          closed: true,
          active: true,
          endDate: in2Min,
          outcomePrices: ['0.96', '0.04'],
          volume: 20000,
        },
        {
          conditionId: 'cond-inactive',
          closed: false,
          active: false,
          endDate: in2Min,
          outcomePrices: ['0.96', '0.04'],
          volume: 20000,
        },
      ]);
      expect(res).toEqual([]);
    });

    it('skips markets with missing or unparseable end dates and missing outcome prices', () => {
      const now = Date.now();
      const in2Min = new Date(now + 2 * 60 * 1000).toISOString();
      const res = scanCycleEndOpportunities([
        {
          conditionId: 'cond-no-date',
          active: true,
          closed: false,
          outcomePrices: ['0.96', '0.04'],
        },
        {
          conditionId: 'cond-invalid-date',
          active: true,
          closed: false,
          endDate: 'not-a-date',
          outcomePrices: ['0.96', '0.04'],
        },
        {
          conditionId: 'cond-no-prices',
          active: true,
          closed: false,
          endDate: in2Min,
          outcomePrices: undefined,
        },
      ]);
      expect(res).toEqual([]);
    });

    it('skips markets with expired or too distant resolution dates', () => {
      const now = Date.now();
      const past = new Date(now - 10000).toISOString();
      const in10Min = new Date(now + 10 * 60 * 1000).toISOString();

      const res = scanCycleEndOpportunities([
        {
          conditionId: 'cond-past',
          active: true,
          closed: false,
          endDate: past,
          outcomePrices: ['0.96', '0.04'],
        },
        {
          conditionId: 'cond-future',
          active: true,
          closed: false,
          endDateIso: in10Min,
          outcomePrices: ['0.96', '0.04'],
        },
      ]);
      expect(res).toEqual([]);
    });

    it('skips markets with invalid or unparseable outcome prices', () => {
      const now = Date.now();
      const in2Min = new Date(now + 2 * 60 * 1000).toISOString();

      const res = scanCycleEndOpportunities([
        {
          conditionId: 'cond-invalid-json',
          active: true,
          closed: false,
          endDate: in2Min,
          outcomePrices: 'bad-json{',
        },
        {
          conditionId: 'cond-out-of-range',
          active: true,
          closed: false,
          endDate: in2Min,
          outcomePrices: ['1.5', '0.0'],
        },
        {
          conditionId: 'cond-zero-price',
          active: true,
          closed: false,
          endDate: in2Min,
          outcomePrices: ['0', '1.0'],
        },
        {
          conditionId: 'cond-empty-arr',
          active: true,
          closed: false,
          endDate: in2Min,
          outcomePrices: '[]',
        },
      ]);
      expect(res).toEqual([]);
    });

    it('detects YES near-certain opportunity and handles low profit/volume skips', () => {
      const now = Date.now();
      const in2Min = new Date(now + 2 * 60 * 1000).toISOString();

      const res = scanCycleEndOpportunities([
        // Profit < MIN_PROFIT (0.005): 1 - 0.985 - 0.02 = -0.005
        {
          conditionId: 'cond-low-profit',
          active: true,
          closed: false,
          endDate: in2Min,
          outcomePrices: JSON.stringify(['0.985', '0.015']),
          volume: 50000,
        },
        // Volume < MIN_VOLUME (10000)
        {
          conditionId: 'cond-low-vol',
          active: true,
          closed: false,
          endDate: in2Min,
          outcomePrices: ['0.96', '0.04'],
          volume: 5000,
        },
        // Valid YES snipe
        {
          conditionId: 'cond-valid-yes',
          question: 'Will Bitcoin reach $100k today?',
          active: true,
          closed: false,
          endDate: in2Min,
          outcomePrices: ['0.96', '0.04'],
          volume: '25000',
        },
      ]);

      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({
        marketId: 'cond-valid-yes',
        title: 'Will Bitcoin reach $100k today?',
        currentYesPrice: 0.96,
        predictedOutcome: 'YES',
        confidence: 0.96,
        expectedProfit: expect.closeTo((1 - 0.96) - 0.02, 4),
      });
      expect(res[0].timeToResolution).toBeGreaterThan(0);
    });

    it('handles undefined conditionId, question, and volume fallbacks on YES and NO signals', () => {
      const now = Date.now();
      const in2Min = new Date(now + 2 * 60 * 1000).toISOString();

      const res = scanCycleEndOpportunities([
        {
          conditionId: undefined,
          question: undefined,
          active: true,
          closed: false,
          endDate: in2Min,
          outcomePrices: ['0.96', '0.04'],
          volume: undefined, // fallback 0 < 10000 -> skipped
        },
        {
          conditionId: undefined,
          question: undefined,
          active: true,
          closed: false,
          endDateIso: in2Min,
          outcomePrices: ['0.96', '0.04'],
          volume: 20000,
        },
        {
          conditionId: undefined,
          question: undefined,
          active: true,
          closed: false,
          endDateIso: in2Min,
          outcomePrices: ['0.03', '0.97'],
          volume: 20000,
        },
      ]);

      expect(res).toHaveLength(2);
      expect(res[0].marketId).toBe('');
      expect(res[0].title).toBe('');
      expect(res[1].marketId).toBe('');
      expect(res[1].title).toBe('');
    });

    it('detects NO near-certain opportunity and handles low profit/volume skips', () => {
      const now = Date.now();
      const in1Min = new Date(now + 1 * 60 * 1000).toISOString();

      const res = scanCycleEndOpportunities([
        // Profit < MIN_PROFIT (0.005): 1 - (1 - 0.015) - 0.02 = 0.015 - 0.02 < 0
        {
          conditionId: 'cond-no-low-profit',
          active: true,
          closed: false,
          endDate: in1Min,
          outcomePrices: ['0.015', '0.985'],
          volume: 50000,
        },
        // Low volume
        {
          conditionId: 'cond-no-low-vol',
          active: true,
          closed: false,
          endDate: in1Min,
          outcomePrices: ['0.03', '0.97'],
          volume: 2000,
        },
        // Undefined volume -> fallback to 0 < 10000
        {
          conditionId: 'cond-no-undef-vol',
          active: true,
          closed: false,
          endDate: in1Min,
          outcomePrices: ['0.03', '0.97'],
          volume: undefined,
        },
        // Valid NO snipe (yesPrice = 0.03, confidence = 1 - 0.03 = 0.97)
        {
          conditionId: 'cond-valid-no',
          question: 'Will Ethereum drop below $1000?',
          active: true,
          closed: false,
          endDate: in1Min,
          outcomePrices: ['0.03', '0.97'],
          volume: 30000,
        },
      ]);

      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({
        marketId: 'cond-valid-no',
        title: 'Will Ethereum drop below $1000?',
        currentYesPrice: 0.03,
        predictedOutcome: 'NO',
        confidence: 0.97,
        expectedProfit: expect.closeTo(0.03 - 0.02, 4),
      });
    });

    it('ignores markets with neutral/uncertain prices (0.05 to 0.95)', () => {
      const now = Date.now();
      const in2Min = new Date(now + 2 * 60 * 1000).toISOString();

      const res = scanCycleEndOpportunities([
        {
          conditionId: 'cond-neutral',
          active: true,
          closed: false,
          endDate: in2Min,
          outcomePrices: ['0.50', '0.50'],
          volume: 100000,
        },
      ]);
      expect(res).toEqual([]);
    });

    it('sorts signals by shortest time to resolution', () => {
      const now = Date.now();
      const in3Min = new Date(now + 3 * 60 * 1000).toISOString();
      const in1Min = new Date(now + 1 * 60 * 1000).toISOString();

      const res = scanCycleEndOpportunities([
        {
          conditionId: 'cond-3min',
          active: true,
          closed: false,
          endDate: in3Min,
          outcomePrices: ['0.96', '0.04'],
          volume: 50000,
        },
        {
          conditionId: 'cond-1min',
          active: true,
          closed: false,
          endDate: in1Min,
          outcomePrices: ['0.96', '0.04'],
          volume: 50000,
        },
      ]);

      expect(res).toHaveLength(2);
      expect(res[0].marketId).toBe('cond-1min');
      expect(res[1].marketId).toBe('cond-3min');
    });
  });

  describe('fetchAndScanCycleEnd', () => {
    it('fetches markets and returns discovered opportunities with info log', async () => {
      const now = Date.now();
      const in1Min = new Date(now + 1 * 60 * 1000).toISOString();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            conditionId: 'cond-live-1',
            question: 'Will Sol reach $250 today?',
            active: true,
            closed: false,
            endDate: in1Min,
            outcomePrices: ['0.96', '0.04'],
            volume: 50000,
          },
        ],
      } as never);

      const signals = await fetchAndScanCycleEnd();
      expect(signals).toHaveLength(1);
      expect(logger.info).toHaveBeenCalledWith(
        '[CycleEndSniper] Opportunities found',
        expect.objectContaining({
          count: 1,
          predictedOutcome: 'YES',
        })
      );
    });

    it('logs debug message when no opportunities are found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      } as never);

      const signals = await fetchAndScanCycleEnd();
      expect(signals).toEqual([]);
      expect(logger.debug).toHaveBeenCalledWith(
        '[CycleEndSniper] No opportunities in current window'
      );
    });

    it('handles non-ok HTTP response status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      } as never);

      const signals = await fetchAndScanCycleEnd();
      expect(signals).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        '[CycleEndSniper] Fetch failed',
        expect.objectContaining({ err: 'Gamma API 502' })
      );
    });

    it('handles network / timeout fetch exception', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection timed out'));

      const signals = await fetchAndScanCycleEnd();
      expect(signals).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        '[CycleEndSniper] Fetch failed',
        expect.objectContaining({ err: 'Connection timed out' })
      );
    });
  });

  describe('isInEntryWindow', () => {
    it('returns true when timeToResolution is within 60 seconds', () => {
      const sig1: CycleEndSignal = {
        marketId: '1',
        title: 'T',
        currentYesPrice: 0.96,
        predictedOutcome: 'YES',
        confidence: 0.96,
        timeToResolution: 30,
        expectedProfit: 0.02,
      };
      const sig2: CycleEndSignal = {
        ...sig1,
        timeToResolution: 60,
      };
      expect(isInEntryWindow(sig1)).toBe(true);
      expect(isInEntryWindow(sig2)).toBe(true);
    });

    it('returns false when timeToResolution exceeds 60 seconds', () => {
      const sig: CycleEndSignal = {
        marketId: '1',
        title: 'T',
        currentYesPrice: 0.96,
        predictedOutcome: 'YES',
        confidence: 0.96,
        timeToResolution: 61,
        expectedProfit: 0.02,
      };
      expect(isInEntryWindow(sig)).toBe(false);
    });
  });
});
