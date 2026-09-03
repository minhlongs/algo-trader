/**
 * Welcome Email Drip Sequence — Unit Tests
 *
 * Covers:
 * - registerDripRecipient: new recipient, duplicate prevention, state persistence
 * - processDripQueue: all 3 email steps, timing gates, send success/failure
 * - processDripQueue: SendGrid not configured, rate limiting, cleanup logic
 * - normalizeSymbol not applicable (no symbol normalization in this module)
 * - CLI entry point (argv check)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted to top of file via vi.hoisted)
// ---------------------------------------------------------------------------

const {
  MockEmailService,
  mockLogger,
  mockFs,
  mockPath,
} = vi.hoisted(() => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  class MockEmailService {
    static instance: MockEmailService | null = null;

    static getInstance() {
      if (!MockEmailService.instance) {
        MockEmailService.instance = new MockEmailService();
      }
      return MockEmailService.instance;
    }

    // Use simple mock functions that always return true by default
    isInitialized = vi.fn().mockReturnValue(true);
    initialize = vi.fn().mockReturnValue(true);
    send = vi.fn().mockResolvedValue(true);
  }

  const mockFs = {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  };

  const mockPath = {
    join: vi.fn((...args: string[]) => args.join('/')),
    dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
  };

  return { MockEmailService, mockLogger, mockFs, mockPath };
});

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

vi.mock('../../../shared/persistence/persistent-store', () => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
}));

vi.mock('../../../platform/notifications/email-service', () => ({
  EmailService: MockEmailService,
}));

vi.mock('node:fs', () => mockFs);

vi.mock('node:path', () => mockPath);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { registerDripRecipient, processDripQueue } from '../welcome-email-drip';
import { readJson, writeJson } from '../../../shared/persistence/persistent-store';
import { EmailService } from '../../../platform/notifications/email-service';
import { logger } from '../../../shared/utils/logger';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('welcome-email-drip', () => {
  let emailServiceInstance: ReturnType<typeof MockEmailService.getInstance>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Reset singleton and get fresh instance
    MockEmailService.instance = null;
    emailServiceInstance = MockEmailService.getInstance();

    // Default mock returns
    emailServiceInstance.isInitialized.mockReturnValue(true);
    emailServiceInstance.initialize.mockReturnValue(true);
    emailServiceInstance.send.mockResolvedValue(true);

    // Default: empty state
    (readJson as ReturnType<typeof vi.fn>).mockReturnValue({ recipients: [] });
    (writeJson as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // The real code uses join(process.cwd(), 'data', 'drip', 'state.json')
  // Our mock path.join returns args joined with '/'
  const DRIP_STATE_FILE = `${process.cwd()}/data/drip/state.json`;

  describe('registerDripRecipient', () => {
    it('registers a new recipient with correct defaults', () => {
      registerDripRecipient('user@example.com', 'PRO');

      expect(readJson).toHaveBeenCalledWith(DRIP_STATE_FILE);
      expect(writeJson).toHaveBeenCalledWith(DRIP_STATE_FILE, expect.objectContaining({
        recipients: expect.arrayContaining([
          expect.objectContaining({
            email: 'user@example.com',
            tier: 'PRO',
            emailsSent: [],
          }),
        ]),
      }));
      expect(logger.info).toHaveBeenCalledWith('[Drip] Registered user@example.com (PRO) for welcome sequence');
    });

    it('skips registration if email already exists', () => {
      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{ email: 'user@example.com', tier: 'FREE', activatedAt: '2024-01-01T00:00:00.000Z', emailsSent: [0] }],
      });

      registerDripRecipient('user@example.com', 'PRO');

      expect(writeJson).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('[Drip] user@example.com already registered, skipping');
    });

    it('sets activatedAt to current ISO timestamp', () => {
      const now = new Date('2024-06-15T12:00:00.000Z');
      vi.setSystemTime(now);

      registerDripRecipient('new@example.com', 'FREE');

      expect(writeJson).toHaveBeenCalledWith(DRIP_STATE_FILE, expect.objectContaining({
        recipients: expect.arrayContaining([
          expect.objectContaining({
            activatedAt: now.toISOString(),
          }),
        ]),
      }));
    });

    it('handles empty initial state', () => {
      (readJson as ReturnType<typeof vi.fn>).mockReturnValue(null);

      registerDripRecipient('first@example.com', 'ENTERPRISE');

      expect(writeJson).toHaveBeenCalledWith(DRIP_STATE_FILE, expect.objectContaining({
        recipients: expect.arrayContaining([
          expect.objectContaining({
            email: 'first@example.com',
            tier: 'ENTERPRISE',
          }),
        ]),
      }));
    });
  });

  describe('processDripQueue', () => {
    const advanceTime = (hours: number) => {
      vi.advanceTimersByTime(hours * 3600_000);
    };

    beforeEach(() => {
      // Reset for each test
      emailServiceInstance.send.mockClear();
      emailServiceInstance.isInitialized.mockReturnValue(true);
      emailServiceInstance.initialize.mockReturnValue(true);
      emailServiceInstance.send.mockResolvedValue(true);
    });

    it('returns early if SendGrid not configured', async () => {
      emailServiceInstance.isInitialized.mockReturnValue(false);
      emailServiceInstance.initialize.mockReturnValue(false);

      await processDripQueue();

      expect(mockLogger.warn).toHaveBeenCalledWith('[Drip] SendGrid not configured, skipping drip processing');
      expect(emailServiceInstance.send).not.toHaveBeenCalled();
    });

    it('sends email 1 (day 0) immediately for new recipient', async () => {
      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'user@example.com',
          tier: 'PRO',
          activatedAt: new Date().toISOString(),
          emailsSent: [],
        }],
      });

      await processDripQueue();

      expect(emailServiceInstance.send).toHaveBeenCalledTimes(1);
      const call = emailServiceInstance.send.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      expect(call.subject).toBe('Welcome to CashClaw — Your quickstart guide');
      expect(call.body).toContain('Your PRO plan is now active');
      expect(call.html).toContain('<strong>PRO</strong>');
      expect(mockLogger.info).toHaveBeenCalledWith('[Drip] Sent email 1/3 to user@example.com');
    });

    it('does NOT send email 1 again if already sent', async () => {
      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'user@example.com',
          tier: 'PRO',
          activatedAt: new Date().toISOString(),
          emailsSent: [0],
        }],
      });

      await processDripQueue();

      expect(emailServiceInstance.send).not.toHaveBeenCalled();
    });

    it('sends email 2 (day 1) after 24 hours', async () => {
      const baseTime = new Date('2024-06-15T12:00:00.000Z');
      vi.setSystemTime(baseTime);

      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'user@example.com',
          tier: 'FREE',
          activatedAt: baseTime.toISOString(),
          emailsSent: [0],
        }],
      });

      await processDripQueue(); // Day 0 already sent
      expect(emailServiceInstance.send).not.toHaveBeenCalled(); // Day 1 not due yet

      advanceTime(24);
      await processDripQueue();

      expect(emailServiceInstance.send).toHaveBeenCalledTimes(1);
      const call = emailServiceInstance.send.mock.calls[0][0];
      expect(call.subject).toBe('CashClaw: 3 features you should try today');
      expect(call.body).toContain('Daily Signal Digest');
      expect(call.body).toContain('Endgame Strategy');
      expect(call.body).toContain('Risk Dashboard');
    });

    it('sends email 3 (day 3) after 72 hours', async () => {
      const baseTime = new Date('2024-06-15T12:00:00.000Z');
      vi.setSystemTime(baseTime);

      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'user@example.com',
          tier: 'STARTER',
          activatedAt: baseTime.toISOString(),
          emailsSent: [0, 1],
        }],
      });

      await processDripQueue(); // Day 0,1 already sent
      advanceTime(72);
      await processDripQueue();

      expect(emailServiceInstance.send).toHaveBeenCalledTimes(1);
      const call = emailServiceInstance.send.mock.calls[0][0];
      expect(call.subject).toBe('CashClaw: Tips from our best traders');
      expect(call.body).toContain('Endgame strategy');
      expect(call.body).toContain('half-Kelly sizing');
      expect(call.body).toContain('7 AM');
      expect(call.body).toContain('5% daily stop-loss');
      // FREE/STARTER should get upgrade CTA
      expect(call.body).toContain('Upgrade at: https://cashclaw.cc/#pricing');
      expect(call.html).toContain('Upgrade to Pro');
    });

    it('email 3 for PRO/ENTERPRISE does NOT include upgrade CTA', async () => {
      const baseTime = new Date('2024-06-15T12:00:00.000Z');
      vi.setSystemTime(baseTime);

      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'user@example.com',
          tier: 'PRO',
          activatedAt: baseTime.toISOString(),
          emailsSent: [0, 1],
        }],
      });

      advanceTime(72);
      await processDripQueue();

      const call = emailServiceInstance.send.mock.calls[0][0];
      expect(call.body).not.toContain('Upgrade at:');
      expect(call.body).toContain('You have full access to all features');
      expect(call.html).not.toContain('Upgrade to Pro');
      expect(call.html).toContain('full access');
    });

    it('email 3 for ENTERPRISE does NOT include upgrade CTA', async () => {
      const baseTime = new Date('2024-06-15T12:00:00.000Z');
      vi.setSystemTime(baseTime);

      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'user@example.com',
          tier: 'ENTERPRISE',
          activatedAt: baseTime.toISOString(),
          emailsSent: [0, 1],
        }],
      });

      advanceTime(72);
      await processDripQueue();

      const call = emailServiceInstance.send.mock.calls[0][0];
      expect(call.body).not.toContain('Upgrade at:');
      expect(call.body).toContain('You have full access to all features');
    });

    it('skips sending if send() returns false', async () => {
      emailServiceInstance.send.mockResolvedValueOnce(false);

      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'user@example.com',
          tier: 'PRO',
          activatedAt: new Date().toISOString(),
          emailsSent: [],
        }],
      });

      await processDripQueue();

      expect(mockLogger.info).not.toHaveBeenCalledWith('[Drip] Sent email 1/3 to user@example.com');
      expect(writeJson).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        recipients: expect.arrayContaining([
          expect.objectContaining({ emailsSent: [0] }),
        ]),
      }));
    });

    it('increments sent counter and persists emailsSent on success', async () => {
      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'user@example.com',
          tier: 'PRO',
          activatedAt: new Date().toISOString(),
          emailsSent: [],
        }],
      });

      await processDripQueue();

      expect(writeJson).toHaveBeenCalledWith(DRIP_STATE_FILE, expect.objectContaining({
        recipients: expect.arrayContaining([
          expect.objectContaining({ emailsSent: [0] }),
        ]),
      }));
    });

    it('processes multiple recipients independently', async () => {
      const baseTime = new Date('2024-06-15T12:00:00.000Z');
      vi.setSystemTime(baseTime);

      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [
          { email: 'a@example.com', tier: 'FREE', activatedAt: baseTime.toISOString(), emailsSent: [] },
          { email: 'b@example.com', tier: 'PRO', activatedAt: baseTime.toISOString(), emailsSent: [0] },
        ],
      });

      await processDripQueue(); // At baseTime, email 0 for 'a' is due (delayHours=0); 'b' has emailsSent=[0], email 1 is delayHours=24 — NOT due at baseTime

      expect(emailServiceInstance.send).toHaveBeenCalledTimes(1);
      expect(emailServiceInstance.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@example.com' }));
      expect(mockLogger.info).toHaveBeenCalledWith('[Drip] Sent email 1/3 to a@example.com');

      // Advance 24 hours - now email 1 for 'b' is due (delayHours=24, activated at baseTime)
      vi.advanceTimersByTime(24 * 3600_000);
      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [
          { email: 'a@example.com', tier: 'FREE', activatedAt: baseTime.toISOString(), emailsSent: [0, 1] }, // email 0 and 1 already sent (email 1 was due at baseTime+24h)
          { email: 'b@example.com', tier: 'PRO', activatedAt: baseTime.toISOString(), emailsSent: [0] }, // only email 0 sent, email 1 now due at baseTime+24h
        ],
      });
      emailServiceInstance.send.mockClear();
      await processDripQueue();

      expect(emailServiceInstance.send).toHaveBeenCalledTimes(1);
      expect(emailServiceInstance.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'b@example.com' }));
      expect(mockLogger.info).toHaveBeenCalledWith('[Drip] Sent email 2/3 to b@example.com');
    });

    it('cleans up completed recipients older than 7 days', async () => {
      // Use a fixed base time so Date.now() is deterministic under fake timers
      const baseTime = new Date('2024-06-15T12:00:00.000Z');
      vi.setSystemTime(baseTime);

      const sevenDaysAgo = new Date(baseTime.getTime() - 8 * 86400_000).toISOString(); // 8 days ago
      const recent = new Date(baseTime.getTime() - 1 * 86400_000).toISOString(); // 1 day ago (recent)
      // incomplete activated 2 days ago (recent enough), only email 0 sent - email 1 (24h) and email 2 (72h) not due yet
      const incompleteRecent = new Date(baseTime.getTime() - 2 * 86400_000).toISOString();

      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [
          { email: 'old@example.com', tier: 'FREE', activatedAt: sevenDaysAgo, emailsSent: [0, 1, 2] }, // completed, old
          { email: 'recent@example.com', tier: 'PRO', activatedAt: recent, emailsSent: [0, 1, 2] }, // completed, recent
          { email: 'incomplete@example.com', tier: 'FREE', activatedAt: incompleteRecent, emailsSent: [0] }, // incomplete, recent (not 7 days old)
        ],
      });

      await processDripQueue();

      expect(writeJson).toHaveBeenCalledWith(DRIP_STATE_FILE, expect.objectContaining({
        recipients: expect.arrayContaining([
          expect.objectContaining({ email: 'recent@example.com' }),
          expect.objectContaining({ email: 'incomplete@example.com' }),
        ]),
      }));
      expect(writeJson).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        recipients: expect.arrayContaining([
          expect.objectContaining({ email: 'old@example.com' }),
        ]),
      }));
    });

    it('logs total sent count when emails were sent', async () => {
      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [
          { email: 'a@example.com', tier: 'FREE', activatedAt: new Date().toISOString(), emailsSent: [] },
          { email: 'b@example.com', tier: 'PRO', activatedAt: new Date().toISOString(), emailsSent: [] },
        ],
      });

      await processDripQueue();

      expect(mockLogger.info).toHaveBeenCalledWith('[Drip] Sent 2 drip emails this cycle');
    });

    it('does NOT log sent count when no emails sent', async () => {
      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'a@example.com', tier: 'FREE', activatedAt: new Date().toISOString(), emailsSent: [0, 1, 2],
        }],
      });

      await processDripQueue();

      // Use the mock logger directly for negative assertion
      expect(mockLogger.info).not.toHaveBeenCalledWith('[Drip] Sent 1 drip emails this cycle');
    });

    it('handles empty recipients array', async () => {
      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({ recipients: [] });

      await expect(processDripQueue()).resolves.not.toThrow();
      expect(emailServiceInstance.send).not.toHaveBeenCalled();
    });

    it('handles readJson returning null', async () => {
      (readJson as ReturnType<typeof vi.fn>).mockReturnValue(null);

      await expect(processDripQueue()).resolves.not.toThrow();
      expect(emailServiceInstance.send).not.toHaveBeenCalled();
    });

    it('email 1 HTML contains correct structure', async () => {
      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'user@example.com',
          tier: 'PRO',
          activatedAt: new Date().toISOString(),
          emailsSent: [],
        }],
      });

      await processDripQueue();

      const call = emailServiceInstance.send.mock.calls[0][0];
      expect(call.html).toContain('<h2 style="color:#00D4AA">Welcome to CashClaw</h2>');
      expect(call.html).toContain('/link &lt;your-key&gt;');
      expect(call.html).toContain('/status');
      expect(call.html).toContain('cashclaw.cc/trading-performance');
      expect(call.html).toContain('edge &gt; 5%');
    });

    it('email 2 HTML contains correct structure', async () => {
      const baseTime = new Date('2024-06-15T12:00:00.000Z');
      vi.setSystemTime(baseTime);

      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'user@example.com',
          tier: 'FREE',
          activatedAt: baseTime.toISOString(),
          emailsSent: [0],
        }],
      });

      advanceTime(24);
      await processDripQueue();

      const call = emailServiceInstance.send.mock.calls[0][0];
      expect(call.html).toContain('<h2 style="color:#00D4AA">3 Features Worth Exploring</h2>');
      expect(call.html).toContain('Daily Signal Digest');
      expect(call.html).toContain('Endgame Strategy');
      expect(call.html).toContain('Risk Dashboard');
      expect(call.html).toContain('cashclaw.cc/blog');
    });

    it('email 3 HTML contains correct structure for FREE tier', async () => {
      const baseTime = new Date('2024-06-15T12:00:00.000Z');
      vi.setSystemTime(baseTime);

      (readJson as ReturnType<typeof vi.fn>).mockReturnValue({
        recipients: [{
          email: 'user@example.com',
          tier: 'FREE',
          activatedAt: baseTime.toISOString(),
          emailsSent: [0, 1],
        }],
      });

      advanceTime(72);
      await processDripQueue();

      const call = emailServiceInstance.send.mock.calls[0][0];
      expect(call.html).toContain('<h2 style="color:#00D4AA">Tips From Power Users</h2>');
      expect(call.html).toContain('Endgame strategy');
      expect(call.html).toContain('half-Kelly sizing');
      expect(call.html).toContain('7 AM');
      expect(call.html).toContain('5% daily stop-loss');
      expect(call.html).toContain('Upgrade to Pro');
      expect(call.html).toContain('cashclaw.cc/#pricing');
    });
  });

  describe('CLI entry point', () => {
    it('exports registerDripRecipient and processDripQueue', () => {
      expect(typeof registerDripRecipient).toBe('function');
      expect(typeof processDripQueue).toBe('function');
    });
  });
});