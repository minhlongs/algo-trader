import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OnboardingService } from '../../../../src/platform/billing/onboarding-service';
import {
  generateSixDigitCode,
  isValidEmail,
  buildApiInstructions,
} from '../../../../src/platform/billing/onboarding-helpers';
import * as postgresClient from '../../../../src/db/postgres-client';
import { LicenseService } from '../../../../src/platform/billing/license-service';

vi.mock('../../../../src/db/postgres-client', () => ({
  getDbClient: vi.fn(),
}));

vi.mock('../../../../src/desk/jobs/welcome-email-drip', () => ({
  registerDripRecipient: vi.fn(),
}));

describe('Onboarding Helpers', () => {
  it('generates a 6-digit numeric string', () => {
    const code = generateSixDigitCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('validates email format correctly', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('trader.pro@sub.algo.com')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('builds standard API instructions containing license key and tier', () => {
    const instructions = buildApiInstructions('lic-test-12345', 'PRO');
    expect(instructions).toContain('lic-test-12345');
    expect(instructions).toContain('Tier: PRO');
    expect(instructions).toContain('X-License-Key: lic-test-12345');
  });
});

describe('OnboardingService', () => {
  let mockClient: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (postgresClient.getDbClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      connect: vi.fn().mockResolvedValue(mockClient),
    });
  });

  it('singleton getInstance returns stable reference', () => {
    const instance1 = OnboardingService.getInstance();
    const instance2 = OnboardingService.getInstance();
    expect(instance1).toBe(instance2);
  });

  describe('signup', () => {
    it('throws error on invalid email address', async () => {
      const service = OnboardingService.getInstance();
      await expect(
        service.signup({ email: 'bad-email', tier: 'PRO' })
      ).rejects.toThrow('Invalid email format');
    });

    it('rejects if email already has an active license', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'lic-1' }] });
      const service = OnboardingService.getInstance();
      await expect(
        service.signup({ email: 'user@active.com', tier: 'PRO' })
      ).rejects.toThrow('Email already has an active license');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('rejects if signup already pending', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // no active license
        .mockResolvedValueOnce({ rows: [{ id: 'pending-1' }] }); // existing pending
      const service = OnboardingService.getInstance();
      await expect(
        service.signup({ email: 'user@pending.com', tier: 'PRO' })
      ).rejects.toThrow('Signup already pending');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('successfully initiates signup and returns pending details', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // no active license
        .mockResolvedValueOnce({ rows: [] }) // no pending signup
        .mockResolvedValueOnce({ rows: [] }) // update old pending to expired
        .mockResolvedValueOnce({ rows: [] }); // insert new signup

      const service = OnboardingService.getInstance();
      const result = await service.signup({ email: 'new@trader.com', tier: 'PRO' });

      expect(result.email).toBe('new@trader.com');
      expect(result.verificationToken).toMatch(/^\d{6}$/);
      expect(result.pendingId).toBeDefined();
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('verify', () => {
    it('throws when no pending signup found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const service = OnboardingService.getInstance();
      await expect(service.verify('nobody@test.com', '123456')).rejects.toThrow(
        'No pending signup found'
      );
    });

    it('throws when code has expired', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'row-1',
              verification_code: '123456',
              expires_at: new Date(Date.now() - 1000).toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // update status to expired

      const service = OnboardingService.getInstance();
      await expect(service.verify('expired@test.com', '123456')).rejects.toThrow(
        'Verification code has expired'
      );
    });

    it('throws when verification code does not match', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'row-1',
            verification_code: '999999',
            expires_at: new Date(Date.now() + 60000).toISOString(),
          },
        ],
      });

      const service = OnboardingService.getInstance();
      await expect(service.verify('user@test.com', '123456')).rejects.toThrow(
        'Invalid verification code'
      );
    });

    it('successfully verifies on matching code', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'row-1',
              verification_code: '654321',
              expires_at: new Date(Date.now() + 60000).toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // update status to verified

      const service = OnboardingService.getInstance();
      await expect(service.verify('user@test.com', '654321')).resolves.toBeUndefined();
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('activate', () => {
    it('throws when no verified signup found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const service = OnboardingService.getInstance();
      await expect(service.activate('unverified@test.com')).rejects.toThrow(
        'No verified signup found'
      );
    });

    it('throws when session expired', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'row-1',
              tier: 'PRO',
              expires_at: new Date(Date.now() - 1000).toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const service = OnboardingService.getInstance();
      await expect(service.activate('expired-session@test.com')).rejects.toThrow(
        'Session expired. Please sign up again.'
      );
    });

    it('activates license and returns activation credentials', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'row-1',
              tier: 'PRO',
              expires_at: new Date(Date.now() + 60000).toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // update to activated

      const mockLicense = { key: 'lic-valid-key-999', id: 'lic-id-1' };
      vi.spyOn(LicenseService.getInstance(), 'createLicense').mockResolvedValueOnce(
        mockLicense as unknown as ReturnType<typeof LicenseService.prototype.createLicense>
      );

      const service = OnboardingService.getInstance();
      const result = await service.activate('trader@example.com');

      expect(result.licenseKey).toBe('lic-valid-key-999');
      expect(result.tier).toBe('PRO');
      expect(result.apiInstructions).toContain('lic-valid-key-999');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
