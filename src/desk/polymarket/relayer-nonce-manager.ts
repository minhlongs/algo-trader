/**
 * Atomic Relayer Nonce Manager
 * Provides a local memory lock mechanism for nonce management.
 * In production, this can be extended to use Redis or other distributed locks.
 */
import { logger } from '../../shared/utils/logger';

export class RelayerNonceManager {
  private nonce = 0;
  private queue: Array<() => void> = [];
  private isProcessing = false;
  private readonly address: string;

  constructor(address: string, initialNonce: number = 0) {
    this.address = address;
    this.nonce = initialNonce;
  }

  public async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    const next = this.queue.shift();
    if (next) next();
  }

  public release(): void {
    this.isProcessing = false;
    // Delay slightly to ensure stack clears
    setTimeout(() => this.processQueue(), 0);
  }

  public async getNext(): Promise<number> {
    return ++this.nonce;
  }

  public setNonce(nonce: number): void {
    if (nonce > this.nonce) {
      this.nonce = nonce;
    }
  }
}
