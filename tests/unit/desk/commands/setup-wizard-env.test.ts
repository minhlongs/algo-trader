import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  generateEnvContent,
  mergeWithExample,
  saveConfiguration,
} from '../../../../src/desk/commands/setup-wizard-env';
import type { SetupConfig } from '../../../../src/desk/commands/setup-wizard-types';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  };
});

describe('Setup Wizard Env Generation & Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateEnvContent', () => {
    it('generates environment file content with provided full configuration', () => {
      const config: Partial<SetupConfig> = {
        exchangeApiKey: 'my-api-key',
        exchangeSecret: 'my-api-secret',
        tradingMode: 'live',
        riskPerTrade: 2,
        maxDailyLoss: 8,
        telegramBotToken: 'bot-token-123',
        telegramChatId: 'chat-id-456',
      };

      const content = generateEnvContent(config);
      expect(content).toContain('EXCHANGE_API_KEY=my-api-key');
      expect(content).toContain('EXCHANGE_SECRET=my-api-secret');
      expect(content).toContain('TRADING_MODE=live');
      expect(content).toContain('DRY_RUN=false');
      expect(content).toContain('RISK_PER_TRADE=2');
      expect(content).toContain('MAX_DAILY_LOSS=8');
      expect(content).toContain('TELEGRAM_BOT_TOKEN=bot-token-123');
      expect(content).toContain('TELEGRAM_CHAT_ID=chat-id-456');
      expect(content).toContain('ENABLE_LIVE_TRADING=true');
    });

    it('generates fallback defaults when empty config is provided', () => {
      const content = generateEnvContent({});
      expect(content).toContain('EXCHANGE_API_KEY=your-api-key-here');
      expect(content).toContain('EXCHANGE_SECRET=your-secret-here');
      expect(content).toContain('TRADING_MODE=dry-run');
      expect(content).toContain('DRY_RUN=true');
      expect(content).toContain('RISK_PER_TRADE=1');
      expect(content).toContain('MAX_DAILY_LOSS=5');
      expect(content).toContain('ENABLE_LIVE_TRADING=false');
    });
  });

  describe('mergeWithExample', () => {
    it('replaces all configuration patterns in example env content', () => {
      const example = [
        'EXCHANGE_API_KEY=example_key',
        'EXCHANGE_SECRET=example_secret',
        'TRADING_MODE=example_mode',
        'DRY_RUN=true',
        'RISK_PER_TRADE=0.5',
        'MAX_DAILY_LOSS=2',
        'OTHER_VAR=unchanged',
      ].join('\n');

      const config: Partial<SetupConfig> = {
        exchangeApiKey: 'custom-key',
        exchangeSecret: 'custom-secret',
        tradingMode: 'live',
        riskPerTrade: 3,
        maxDailyLoss: 12,
      };

      const merged = mergeWithExample(example, config);
      expect(merged).toContain('EXCHANGE_API_KEY=custom-key');
      expect(merged).toContain('EXCHANGE_SECRET=custom-secret');
      expect(merged).toContain('TRADING_MODE=live');
      expect(merged).toContain('DRY_RUN=false');
      expect(merged).toContain('RISK_PER_TRADE=3');
      expect(merged).toContain('MAX_DAILY_LOSS=12');
      expect(merged).toContain('OTHER_VAR=unchanged');
    });

    it('uses fallback defaults when replacing in example template', () => {
      const example = 'EXCHANGE_API_KEY=example\nEXCHANGE_SECRET=sec\nTRADING_MODE=dry\n';
      const merged = mergeWithExample(example, {});
      expect(merged).toContain('EXCHANGE_API_KEY=your-api-key-here');
      expect(merged).toContain('EXCHANGE_SECRET=your-secret-here');
      expect(merged).toContain('TRADING_MODE=dry-run');
    });
  });

  describe('saveConfiguration', () => {
    it('writes .env and strictly never writes credentials to .env.example (Rule H1)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('EXCHANGE_API_KEY=sample\n');

      saveConfiguration({
        exchangeApiKey: 'persisted-key',
        tradingMode: 'dry-run',
      });

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('EXCHANGE_API_KEY=persisted-key'),
      );
      expect(fs.writeFileSync).not.toHaveBeenCalledWith(
        expect.stringContaining('.env.example'),
        expect.anything(),
      );
    });

    it('writes .env when .env.example does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      saveConfiguration({
        exchangeApiKey: 'persisted-key-2',
      });

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('EXCHANGE_API_KEY=persisted-key-2'),
      );
    });
  });
});

