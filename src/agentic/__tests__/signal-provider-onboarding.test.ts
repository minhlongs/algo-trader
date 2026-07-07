/** SignalProviderOnboarding service tests */

import { describe, it, expect, beforeEach } from 'vitest';
import { SignalProviderOnboarding } from '../signal-provider-onboarding';

describe('SignalProviderOnboarding', () => {
  let service: SignalProviderOnboarding;

  beforeEach(() => {
    service = new SignalProviderOnboarding();
  });

  it('submitApplication returns application with status pending', async () => {
    const app = await service.submitApplication('user-1', 'sk-valid-api-key-12345', 'strat-btc');
    expect(app.id).toMatch(/^prov-\d{4}$/);
    expect(app.userId).toBe('user-1');
    expect(app.strategyId).toBe('strat-btc');
    expect(app.status).toBe('pending');
    expect(app.apiKey).toBe('sk-valid-api-key-12345');
    expect(app.createdAt).toBeInstanceOf(Date);
  });

  it('submitApplication throws on empty apiKey', async () => {
    await expect(
      service.submitApplication('user-1', '', 'strat-btc')
    ).rejects.toThrow('API key must not be empty');
  });

  it('verifyApiKeys with valid key transitions to running_backtest', async () => {
    const app = await service.submitApplication('user-1', 'sk-valid-api-key-12345', 'strat-btc');
    const passed = await service.verifyApiKeys(app.id);
    const updated = await service.getApplication(app.id)!;

    expect(passed).toBe(true);
    expect(updated.status).toBe('running_backtest');
  });

  it('verifyApiKeys with short key rejects application', async () => {
    const app = await service.submitApplication('user-1', 'short', 'strat-btc');
    const passed = await service.verifyApiKeys(app.id);
    const updated = await service.getApplication(app.id)!;

    expect(passed).toBe(false);
    expect(updated.status).toBe('rejected');
    expect(updated.rejectionReason).toBe('Invalid API key format');
  });

  it('runBacktest with good mock approves (sharpe 1.5 > 1.0, winRate 0.55 > 0.5)', async () => {
    const app = await service.submitApplication('user-1', 'sk-valid-api-key-12345', 'strat-btc');
    await service.verifyApiKeys(app.id);

    const result = await service.runBacktest(app.id, app.strategyId);
    const updated = await service.getApplication(app.id)!;

    expect(result.sharpe).toBe(1.5);
    expect(result.winRate).toBe(0.55);
    expect(updated.status).toBe('paper_trading');
    expect(updated.backtestResult).toBeDefined();
    expect(updated.backtestResult!.maxDrawdown).toBe(0.12);
  });

  it('getApplication after submit returns same application', async () => {
    const submitted = await service.submitApplication('user-1', 'sk-valid-api-key-12345', 'strat-btc');
    const fetched = await service.getApplication(submitted.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(submitted.id);
    expect(fetched!.userId).toBe('user-1');
  });

  it('getApplication returns null for unknown id', async () => {
    const fetched = await service.getApplication('prov-9999');
    expect(fetched).toBeNull();
  });

  it('approveApplication marks approved when all stages passed', async () => {
    const app = await service.submitApplication('user-1', 'sk-valid-api-key-12345', 'strat-btc');
    await service.verifyApiKeys(app.id);
    await service.runBacktest(app.id, app.strategyId);
    await service.startPaperTrading(app.id);

    await service.approveApplication(app.id);
    const updated = await service.getApplication(app.id)!;

    expect(updated.status).toBe('approved');
  });

  it('approveApplication rejects when stages incomplete', async () => {
    const app = await service.submitApplication('user-1', 'sk-valid-api-key-12345', 'strat-btc');
    // skip verify and backtest
    await service.approveApplication(app.id);
    const updated = await service.getApplication(app.id)!;

    expect(updated.status).toBe('rejected');
    expect(updated.rejectionReason).toContain('stages completed');
  });
});
