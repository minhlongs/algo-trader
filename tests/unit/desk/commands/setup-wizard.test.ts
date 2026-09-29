import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSetupWizard } from '../../../../src/desk/commands/setup-wizard';
import * as promptModule from '../../../../src/desk/commands/setup-wizard-prompt';
import * as envModule from '../../../../src/desk/commands/setup-wizard-env';
import { logger } from '../../../../src/shared/utils/logger';

vi.mock('../../../../src/desk/commands/setup-wizard-env', () => ({
  saveConfiguration: vi.fn(),
  generateEnvContent: vi.fn(),
  mergeWithExample: vi.fn(),
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Setup Wizard Command (runSetupWizard)', () => {
  let promptMock: ReturnType<typeof vi.fn>;
  let closeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    closeMock = vi.fn();
    vi.spyOn(promptModule, 'createPrompt').mockReturnValue({
      close: closeMock,
    } as unknown as ReturnType<typeof promptModule.createPrompt>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs interactive setup wizard with full live config, custom risk and telegram enabled', async () => {
    promptMock = vi.fn()
      // Step 1: API keys
      .mockResolvedValueOnce('api-key-123')
      .mockResolvedValueOnce('api-secret-456')
      // Step 2: Trading mode (2 = live)
      .mockResolvedValueOnce('2')
      // Step 3: Risk choice (4 = custom)
      .mockResolvedValueOnce('4')
      .mockResolvedValueOnce('2.5') // riskPerTrade
      .mockResolvedValueOnce('7.5') // maxDailyLoss
      // Step 4: Telegram
      .mockResolvedValueOnce('y')
      .mockResolvedValueOnce('tg-token-789')
      .mockResolvedValueOnce('tg-chat-001');

    vi.spyOn(promptModule, 'prompt').mockImplementation(promptMock);

    await runSetupWizard();

    expect(envModule.saveConfiguration).toHaveBeenCalledWith({
      exchangeApiKey: 'api-key-123',
      exchangeSecret: 'api-secret-456',
      tradingMode: 'live',
      riskPerTrade: 2.5,
      maxDailyLoss: 7.5,
      telegramBotToken: 'tg-token-789',
      telegramChatId: 'tg-chat-001',
    });
    expect(closeMock).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('✅ API keys saved\n');
    expect(logger.info).toHaveBeenCalledWith('✅ Telegram configured\n');
  });

  it('runs interactive setup wizard with dry-run, conservative risk preset and skipped telegram', async () => {
    promptMock = vi.fn()
      // Step 1: blank API keys
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      // Step 2: default mode 1
      .mockResolvedValueOnce('1')
      // Step 3: risk preset 1 (conservative)
      .mockResolvedValueOnce('1')
      // Step 4: telegram no
      .mockResolvedValueOnce('n');

    vi.spyOn(promptModule, 'prompt').mockImplementation(promptMock);

    await runSetupWizard();

    expect(envModule.saveConfiguration).toHaveBeenCalledWith({
      exchangeApiKey: '',
      exchangeSecret: '',
      tradingMode: 'dry-run',
      riskPerTrade: 0.5,
      maxDailyLoss: 2,
    });
    expect(closeMock).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('⚠️  Skipping API keys (dry-run mode only)\n');
  });

  it('runs interactive setup wizard with aggressive risk preset and telegram yes but empty fields', async () => {
    promptMock = vi.fn()
      // Step 1: API keys
      .mockResolvedValueOnce('some-key')
      .mockResolvedValueOnce('')
      // Step 2: default mode
      .mockResolvedValueOnce('')
      // Step 3: risk preset 3 (aggressive)
      .mockResolvedValueOnce('3')
      // Step 4: telegram yes but empty tokens
      .mockResolvedValueOnce('yes')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');

    vi.spyOn(promptModule, 'prompt').mockImplementation(promptMock);

    await runSetupWizard();

    expect(envModule.saveConfiguration).toHaveBeenCalledWith({
      exchangeApiKey: 'some-key',
      exchangeSecret: '',
      tradingMode: 'dry-run',
      riskPerTrade: 2,
      maxDailyLoss: 10,
      telegramBotToken: '',
      telegramChatId: '',
    });
    expect(logger.info).toHaveBeenCalledWith('⚠️  Skipping Telegram\n');
  });

  it('handles invalid risk preset selection with fallback values', async () => {
    promptMock = vi.fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('99') // Invalid preset index
      .mockResolvedValueOnce('no');

    vi.spyOn(promptModule, 'prompt').mockImplementation(promptMock);

    await runSetupWizard();

    expect(envModule.saveConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        riskPerTrade: 1,
        maxDailyLoss: 5,
      })
    );
  });
});
