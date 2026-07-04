/**
 * Wallet Manager Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { WalletManager, type WalletLabel } from '../wallet-manager';

/** Use a temp path so tests don't touch ~/.cashclaw */
function tmpStatePath(): string {
  return path.join(os.tmpdir(), `wm-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

/** Helper: await recordTrade (async) for test assertions */
async function recordTradeAsync(
  wm: WalletManager,
  trade: Parameters<typeof wm.recordTrade>[0],
  executingWalletLabel: WalletLabel,
): Promise<void> {
  return wm.recordTrade(trade, executingWalletLabel);
}

describe('WalletManager', () => {
  describe('registration', () => {
    it('should register a wallet', () => {
      const wm = new WalletManager(tmpStatePath());
      const wallet = wm.registerWallet('0xabc', 'own-capital', 50000);
      expect(wallet.label).toBe('own-capital');
      expect(wallet.capitalAllocation).toBe(50000);
      expect(wallet.currentBalance).toBe(50000);
    });

    it('should reject duplicate labels', () => {
      const wm = new WalletManager(tmpStatePath());
      wm.registerWallet('0xabc', 'own-capital', 50000);
      expect(() => wm.registerWallet('0xdef', 'own-capital', 30000)).toThrow('already registered');
    });

    it('should register managed wallets', () => {
      const wm = new WalletManager(tmpStatePath());
      wm.registerWallet('0xabc', 'managed-client1', 100000);
      const wallet = wm.getWallet('managed-client1');
      expect(wallet?.label).toBe('managed-client1');
    });
  });

  describe('fund isolation', () => {
    it('should allow own-capital trade when executing wallet matches', async () => {
      const wm = new WalletManager(tmpStatePath());
      wm.registerWallet('0xabc', 'own-capital', 50000);
      await expect(recordTradeAsync(wm, {
        walletLabel: 'own-capital', marketId: 'BTC', side: 'buy',
        sizeUsd: 1000, price: 50000, pnl: 50, timestamp: Date.now(),
      }, 'own-capital')).resolves.toBeUndefined();
    });

    it('should throw when executingWalletLabel differs from trade.walletLabel', async () => {
      const wm = new WalletManager(tmpStatePath());
      wm.registerWallet('0xabc', 'own-capital', 50000);
      wm.registerWallet('0xdef', 'managed-client1', 100000);
      await expect(recordTradeAsync(wm, {
        walletLabel: 'managed-client1', marketId: 'BTC', side: 'buy',
        sizeUsd: 1000, price: 50000, pnl: 50, timestamp: Date.now(),
      }, 'own-capital')).rejects.toThrow('isolation violation');
    });

    it('should reject trade when trade walletLabel does not match executing wallet', async () => {
      const wm = new WalletManager(tmpStatePath());
      wm.registerWallet('0xabc', 'own-capital', 50000);
      await expect(recordTradeAsync(wm, {
        walletLabel: 'managed-client1', marketId: 'BTC', side: 'buy',
        sizeUsd: 1000, price: 50000, pnl: 50, timestamp: Date.now(),
      }, 'own-capital')).rejects.toThrow();
    });

    it('should validate own-capital trades go to own wallet', () => {
      const wm = new WalletManager(tmpStatePath());
      wm.registerWallet('0xabc', 'own-capital', 50000);
      wm.registerWallet('0xdef', 'managed-client1', 100000);

      expect(wm.validateTradeWallet('own-capital', true)).toBe(true);
      expect(wm.validateTradeWallet('managed-client1', true)).toBe(false);
    });

    it('should validate managed trades go to managed wallet', () => {
      const wm = new WalletManager(tmpStatePath());
      wm.registerWallet('0xabc', 'own-capital', 50000);
      wm.registerWallet('0xdef', 'managed-client1', 100000);

      expect(wm.validateTradeWallet('managed-client1', false)).toBe(true);
      expect(wm.validateTradeWallet('own-capital', false)).toBe(false);
    });
  });

  describe('per-wallet capital', () => {
    it('should return allocated capital per wallet for Kelly sizing', () => {
      const wm = new WalletManager(tmpStatePath());
      wm.registerWallet('0xabc', 'own-capital', 50000);
      wm.registerWallet('0xdef', 'managed-client1', 100000);

      expect(wm.getAllocatedCapital('own-capital')).toBe(50000);
      expect(wm.getAllocatedCapital('managed-client1')).toBe(100000);
    });

    it('should return 0 for unknown wallet', () => {
      const wm = new WalletManager(tmpStatePath());
      expect(wm.getAllocatedCapital('managed-unknown' as WalletLabel)).toBe(0);
    });

    it('should track isolated PnL per wallet', () => {
      const wm = new WalletManager(tmpStatePath());
      wm.registerWallet('0xabc', 'own-capital', 50000);
      wm.registerWallet('0xdef', 'managed-client1', 100000);

      wm.recordTrade({ walletLabel: 'own-capital', marketId: 'BTC', side: 'buy', sizeUsd: 1000, price: 50000, pnl: 200, timestamp: Date.now() }, 'own-capital');
      wm.recordTrade({ walletLabel: 'managed-client1', marketId: 'ETH', side: 'sell', sizeUsd: 500, price: 3000, pnl: -50, timestamp: Date.now() }, 'managed-client1');

      expect(wm.getWallet('own-capital')!.isolatedPnl).toBe(200);
      expect(wm.getWallet('managed-client1')!.isolatedPnl).toBe(-50);
      expect(wm.getWallet('own-capital')!.currentBalance).toBe(50200);
      expect(wm.getWallet('managed-client1')!.currentBalance).toBe(99950);
    });
  });

  describe('summary', () => {
    it('should return correct summary across all wallets', () => {
      const wm = new WalletManager(tmpStatePath());
      wm.registerWallet('0xabc', 'own-capital', 50000);
      wm.registerWallet('0xdef', 'managed-client1', 100000);
      wm.registerWallet('0xghi', 'managed-client2', 75000);

      const summary = wm.getSummary();
      expect(summary.totalWallets).toBe(3);
      expect(summary.totalCapital).toBe(225000);
      expect(summary.ownCapital).not.toBeNull();
      expect(summary.managedWallets.length).toBe(2);
    });
  });

  describe('trade history', () => {
    it('should track trades per wallet', () => {
      const wm = new WalletManager(tmpStatePath());
      wm.registerWallet('0xabc', 'own-capital', 50000);

      wm.recordTrade({ walletLabel: 'own-capital', marketId: 'BTC', side: 'buy', sizeUsd: 1000, price: 50000, pnl: 100, timestamp: 1 }, 'own-capital');
      wm.recordTrade({ walletLabel: 'own-capital', marketId: 'ETH', side: 'sell', sizeUsd: 500, price: 3000, pnl: -20, timestamp: 2 }, 'own-capital');

      const history = wm.getTradeHistory('own-capital');
      expect(history.length).toBe(2);
      expect(history[0].marketId).toBe('BTC');
    });
  });

  describe('persistence', () => {
    it('should restore wallet state after reload', async () => {
      const statePath = tmpStatePath();
      const wm1 = new WalletManager(statePath);
      wm1.registerWallet('0xabc', 'own-capital', 50000);
      wm1.recordTrade({ walletLabel: 'own-capital', marketId: 'BTC', side: 'buy', sizeUsd: 1000, price: 50000, pnl: 300, timestamp: 1 }, 'own-capital');
      await wm1.writePromise;

      // New instance loading from same path = simulates PM2 restart
      const wm2 = new WalletManager(statePath);
      expect(wm2.getWallet('own-capital')?.currentBalance).toBe(50300);
      expect(wm2.getWallet('own-capital')?.isolatedPnl).toBe(300);
    });
  });
});
