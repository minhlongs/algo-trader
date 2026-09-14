/**
 * Distributed Nonce Manager
 * Redis INCR-based atomic nonce pool for concurrent transaction safety.
 *
 * Pattern: reserveNonce() → sign tx → broadcast tx → if fail: releaseNonce()
 * Multiple workers can safely call reserveNonce() simultaneously — Redis INCR is atomic.
 *
 * Redis key schema: nonce:{walletAddress} → current nonce counter
 */

import { getRedisClient } from '../../redis/index';
import { logger } from '../../shared/utils/logger';
import {
  NONCE_TTL_MS,
  NONCE_RELEASE_SCRIPT,
  formatNonceKey,
  type NonceReservation,
} from './distributed-nonce-types';

export type { NonceReservation } from './distributed-nonce-types';
export { NONCE_TTL_MS, NONCE_KEY_PREFIX } from './distributed-nonce-types';

/**
 * Manages transaction nonces across multiple concurrent workers via Redis.
 * Uses Redis INCR for atomic, race-condition-free nonce assignment.
 */
export class DistributedNonceManager {
  private readonly getOnChainNonce: (walletAddress: string) => Promise<number>;
  private readonly initPromises = new Map<string, Promise<void>>();
  private readonly initializedWallets = new Set<string>();

  constructor(getOnChainNonce: (walletAddress: string) => Promise<number>) {
    this.getOnChainNonce = getOnChainNonce;
  }

  private nonceKey(walletAddress: string): string {
    return formatNonceKey(walletAddress);
  }

  private async ensureInitialised(walletAddress: string): Promise<void> {
    const addressKey = walletAddress.toLowerCase();
    if (this.initializedWallets.has(addressKey)) return;

    let initPromise = this.initPromises.get(addressKey);
    if (!initPromise) {
      initPromise = (async () => {
        try {
          const redis = getRedisClient();
          const key = this.nonceKey(walletAddress);

          const existing = await redis.get(key);
          if (existing !== null) {
            this.initializedWallets.add(addressKey);
            return;
          }

          const onChainNonce = await this.getOnChainNonce(walletAddress);
          await redis.set(key, onChainNonce, 'NX' as never);

          logger.info('[NonceManager] Seeded nonce from chain', {
            walletAddress,
            onChainNonce,
          });

          this.initializedWallets.add(addressKey);
        } catch (err) {
          this.initPromises.delete(addressKey);
          throw err;
        }
      })();
      this.initPromises.set(addressKey, initPromise);
    }

    await initPromise;
  }

  async reserveNonce(walletAddress: string): Promise<NonceReservation> {
    await this.ensureInitialised(walletAddress);

    const redis = getRedisClient();
    const key = this.nonceKey(walletAddress);

    const afterIncrement = await redis.incr(key);
    const reservedNonce = afterIncrement - 1;

    logger.debug('[NonceManager] Reserved nonce', {
      walletAddress,
      nonce: reservedNonce,
    });

    return {
      walletAddress,
      nonce: reservedNonce,
      reservedAt: Date.now(),
    };
  }

  async releaseNonce(reservation: NonceReservation): Promise<void> {
    const ageMs = Date.now() - reservation.reservedAt;
    if (ageMs > NONCE_TTL_MS) {
      logger.warn('[NonceManager] Stale nonce release skipped — may be unsafe', {
        walletAddress: reservation.walletAddress,
        nonce: reservation.nonce,
        ageMs,
      });
      return;
    }

    const redis = getRedisClient();
    const key = this.nonceKey(reservation.walletAddress);

    const result = await redis.eval(
      NONCE_RELEASE_SCRIPT,
      1,
      key,
      (reservation.nonce + 1).toString(),
    );

    if (result !== null) {
      logger.info('[NonceManager] Released nonce', {
        walletAddress: reservation.walletAddress,
        nonce: reservation.nonce,
        newVal: result,
      });
    } else {
      logger.warn('[NonceManager] Nonce release skipped — newer nonce already reserved', {
        walletAddress: reservation.walletAddress,
        nonce: reservation.nonce,
      });
    }
  }

  async getCurrentNonce(walletAddress: string): Promise<number | null> {
    const redis = getRedisClient();
    const raw = await redis.get(this.nonceKey(walletAddress));
    return raw !== null ? parseInt(raw, 10) : null;
  }

  async resyncFromChain(walletAddress: string): Promise<number> {
    const onChainNonce = await this.getOnChainNonce(walletAddress);
    const redis = getRedisClient();
    await redis.set(this.nonceKey(walletAddress), onChainNonce);

    const addressKey = walletAddress.toLowerCase();
    this.initializedWallets.add(addressKey);
    this.initPromises.delete(addressKey);

    logger.info('[NonceManager] Resynced nonce from chain', {
      walletAddress,
      onChainNonce,
    });

    return onChainNonce;
  }
}
