/**
 * Tests for FraudDetector — referral click fraud scoring.
 *
 * Mocks the PostgreSQL client (getDbClient.query) so detectFraud /
 * batchAnalyzeClicks are exercised without a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = vi.fn();
const mockGetDbClient = vi.fn().mockReturnValue({ query: mockQuery });

vi.mock('../../../shared/db/postgres-client.js', () => ({
  getDbClient: (...args: unknown[]) => mockGetDbClient(...args),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { FraudDetector, type FraudDetectionConfig, fraudDetector } from '../fraud-detector';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLEAN_IP = '8.8.8.8';
const CLEAN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

/** Set up the three sequential queries detectFraud issues (ip, ua, rapid). */
function setupDetectQueries(ipCount: number, uaCount: number, rapidCount: number) {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ count: ipCount }] })
    .mockResolvedValueOnce({ rows: [{ count: uaCount }] })
    .mockResolvedValueOnce({ rows: [{ count: rapidCount }] });
}

// ─── Constructor / config ────────────────────────────────────────────────────

describe('FraudDetector constructor', () => {
  it('applies documented defaults when no config is passed', () => {
    const fd = new FraudDetector();
    // @ts-expect-error - reach into private field
    const cfg = fd.config as FraudDetectionConfig;
    expect(cfg.maxClicksPerIpPerDay).toBe(100);
    expect(cfg.maxClicksPerUserAgentPerDay).toBe(50);
    expect(cfg.fraudThreshold).toBe(70);
    expect(cfg.suspiciousUserAgents).toEqual([
      'HeadlessChrome', 'PhantomJS', 'Selenium', 'Puppeteer', 'curl', 'wget',
    ]);
  });

  it('merges partial overrides on top of defaults', () => {
    const fd = new FraudDetector({ fraudThreshold: 50, maxClicksPerIpPerDay: 20 });
    // @ts-expect-error - reach into private field
    const cfg = fd.config as FraudDetectionConfig;
    expect(cfg.fraudThreshold).toBe(50);
    expect(cfg.maxClicksPerIpPerDay).toBe(20);
    expect(cfg.maxClicksPerUserAgentPerDay).toBe(50);
    expect(cfg.suspiciousUserAgents).toHaveLength(6);
  });

  it('exposes a module-level singleton instance', () => {
    expect(fraudDetector).toBeInstanceOf(FraudDetector);
  });
});

// ─── detectFraud ──────────────────────────────────────────────────────────────

describe('FraudDetector.detectFraud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDbClient.mockReturnValue({ query: mockQuery });
  });

  it('returns score 0 and isBlocked false for a clean click', async () => {
    setupDetectQueries(0, 0, 0);
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', CLEAN_IP, CLEAN_UA);
    expect(result).toEqual({ score: 0, reasons: [], isBlocked: false });
  });

  it('adds 40 points for a suspicious user agent', async () => {
    setupDetectQueries(0, 0, 0);
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', CLEAN_IP, 'Puppeteer/5.0');
    expect(result.score).toBe(40);
    expect(result.reasons).toContain('Suspicious user agent detected');
    expect(result.isBlocked).toBe(false);
  });

  it('adds 30 points for a high click volume from the same IP', async () => {
    setupDetectQueries(200, 0, 0);
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', CLEAN_IP, CLEAN_UA);
    expect(result.score).toBe(30);
    expect(result.reasons).toContain('High click volume from IP: 200 clicks in 24h');
  });

  it('adds 20 points for a high click volume from the same user agent', async () => {
    setupDetectQueries(0, 60, 0);
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', CLEAN_IP, CLEAN_UA);
    expect(result.score).toBe(20);
    expect(result.reasons).toContain('High click volume from user agent: 60 clicks in 24h');
  });

  it('adds 20 points for an empty/short user agent', async () => {
    setupDetectQueries(0, 0, 0);
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', CLEAN_IP, '');
    expect(result.score).toBe(20);
    expect(result.reasons).toContain('Invalid or too short user agent');
  });

  it('adds 30 points for a click from a private IP range', async () => {
    setupDetectQueries(0, 0, 0);
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', '192.168.0.1', CLEAN_UA);
    expect(result.score).toBe(30);
    expect(result.reasons).toContain('Click from private IP range');
  });

  it('recognises several private/localhost IP forms', async () => {
    const fd = new FraudDetector();
    for (const ip of ['127.0.0.1', '::1', '10.0.0.1', '172.16.0.1', 'fc00::1', 'fe80::1']) {
      // Fresh mock setup per iteration so mock queries don't exhaust
      setupDetectQueries(0, 0, 0);
      const r = await fd.detectFraud('t-1', ip, CLEAN_UA);
      expect(r.reasons).toContain('Click from private IP range');
    }
  });

  it('does not flag a normal public IP as private', async () => {
    setupDetectQueries(0, 0, 0);
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', '1.2.3.4', CLEAN_UA);
    expect(result.reasons).not.toContain('Click from private IP range');
  });

  it('adds 25 points for rapid clicks from the same IP', async () => {
    setupDetectQueries(0, 0, 15);
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', CLEAN_IP, CLEAN_UA);
    expect(result.score).toBe(25);
    expect(result.reasons).toContain('Rapid clicks detected from same IP');
  });

  it('does not flag a moderate click count under the IP threshold', async () => {
    setupDetectQueries(50, 0, 0);
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', CLEAN_IP, CLEAN_UA);
    expect(result.score).toBe(0);
  });

  it('caps the score at 100 even when signals sum higher', async () => {
    // suspicious UA (+40) + high IP (+30) + high UA (+20) + private IP (+30)
    // + rapid (+25) = 145 -> capped at 100
    setupDetectQueries(200, 100, 15);
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', '192.168.0.1', 'Puppeteer/5.0');
    expect(result.score).toBe(100);
    expect(result.isBlocked).toBe(true);
  });

  it('blocks when the score reaches the fraud threshold', async () => {
    // suspicious UA (40) + high IP (30) = 70 -> threshold 70
    setupDetectQueries(200, 0, 0);
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', CLEAN_IP, 'Puppeteer/5.0');
    expect(result.isBlocked).toBe(true);
  });

  it('honours a lower fraudThreshold override', async () => {
    setupDetectQueries(0, 0, 0);
    const fd = new FraudDetector({ fraudThreshold: 20 });
    const result = await fd.detectFraud('t-1', CLEAN_IP, '');
    expect(result.score).toBe(20);
    expect(result.isBlocked).toBe(true);
  });

  it('queries referral_tracking by ip, user agent and rapid window', async () => {
    setupDetectQueries(0, 0, 0);
    const fd = new FraudDetector();
    await fd.detectFraud('t-1', '8.8.8.8', 'curl/7.88.1');
    expect(mockQuery).toHaveBeenCalledTimes(3);
    const sql0 = mockQuery.mock.calls[0]![0] as string;
    const sql1 = mockQuery.mock.calls[1]![0] as string;
    const sql2 = mockQuery.mock.calls[2]![0] as string;
    expect(sql0).toContain('clicked_by_ip');
    expect(sql1).toContain('clicked_by_user_agent');
    expect(sql2).toContain('clicked_by_ip');
    expect(sql2).toContain("INTERVAL '1 minute'");
    // mockQuery.mock.calls[0] is [sql, params], so params is at index 1
    expect(mockQuery.mock.calls[0]![1]).toEqual(['8.8.8.8']);
  });

  it('defaults a missing row count to 0', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 5 }] })
      .mockResolvedValueOnce({ rows: [] });
    const fd = new FraudDetector();
    const result = await fd.detectFraud('t-1', CLEAN_IP, CLEAN_UA);
    // ip count 0 (no row) -> not high; ua count 5 (<50) -> not high; rapid 0
    expect(result.score).toBe(0);
  });
});

// ─── batchAnalyzeClicks ───────────────────────────────────────────────────────

describe('FraudDetector.batchAnalyzeClicks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDbClient.mockReturnValue({ query: mockQuery });
  });

  it('returns zeroed summary when there are no rows to analyze', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const fd = new FraudDetector();
    const result = await fd.batchAnalyzeClicks(10);
    expect(result).toEqual({ analyzed: 0, flagged: 0, averageScore: 0 });
  });

  it('analyzes each click, flags fraudulent ones and updates the DB', async () => {
    // Initial SELECT returns 2 clicks to analyze
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'a1', clicked_by_ip: '8.8.8.8', clicked_by_user_agent: CLEAN_UA },
        { id: 'a2', clicked_by_ip: '192.168.0.1', clicked_by_user_agent: CLEAN_UA },
      ],
    });
    // a1: clean (0,0,0) -> score 0
    // a2: private IP (+30) -> score 30, isBlocked=true (30 >= 70? no, threshold is 70)
    // Wait - private IP is 30, not enough to block. Let's check: threshold is 70 default.
    // So a2 score = 30, isBlocked = false. But we need one flagged.
    // We need a2 to have score >= 70. Let's add more signals or lower threshold.
    // Actually, let's make a2 have suspicious UA too.
    // Or we can just use a custom config with lower threshold.

    // Let's just test with a config that has fraudThreshold = 20 so private IP (30) blocks
    // But we're using default config here.

    // Better approach: use the default config, and make a2 have high IP + private IP = 60, still not blocked.
    // We need at least 70. Let's use: private IP (30) + suspicious UA (40) = 70 -> blocked!

    // Actually the test setup is: a1 is clean (score 0), a2 is private IP (score 30).
    // With default threshold 70, neither is blocked. So flagged should be 0.
    // The test expected 1 flagged - that was wrong.
    // Let's fix the test to match reality: use a custom config with threshold 20,
    // or change the expected result.

    // For this test, let's use a custom FraudDetector with lower threshold
    // to demonstrate the flagging logic works.

    const fd = new FraudDetector({ fraudThreshold: 20 });

    // a1: clean -> score 0 (3 queries)
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })   // a1 ip
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })   // a1 ua
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });  // a1 rapid
    // a2: private IP -> score 30 (3 queries) + 1 UPDATE
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })   // a2 ip
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })   // a2 ua
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })   // a2 rapid
      .mockResolvedValueOnce({ rows: [] });              // a2 UPDATE

    const result = await fd.batchAnalyzeClicks(100);
    expect(result.analyzed).toBe(2);
    expect(result.flagged).toBe(1); // a2 flagged because 30 >= 20
    expect(result.averageScore).toBe(15); // (0 + 30) / 2

    // The flagged row was UPDATEd with its score and is_fraudulent = true
    const updateCall = mockQuery.mock.calls[7]!;
    expect(updateCall[0]).toContain('UPDATE referral_tracking');
    expect(updateCall[0]).toContain('fraud_score = $1');
    expect(updateCall[1]).toEqual([30, 'a2']);
  });

  it('does not update rows that fell below the fraud threshold', async () => {
    // Initial SELECT returns 1 click
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'b1', clicked_by_ip: '8.8.8.8', clicked_by_user_agent: CLEAN_UA }],
    });
    // b1: clean -> score 0 (3 queries), no UPDATE
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const fd = new FraudDetector();
    const result = await fd.batchAnalyzeClicks();
    expect(result).toEqual({ analyzed: 1, flagged: 0, averageScore: 0 });
    // 1 SELECT + 3 detect queries = 4 total, no UPDATE
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });
});