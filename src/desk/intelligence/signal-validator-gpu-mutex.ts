/**
 * Signal Validator — GPU mutex.
 * Split from signal-validator.ts (S16 tranche 3).
 * Mutex to serialize GPU executions and prevent concurrent thrashing.
 */

export class GpuMutex {
  private queue: (() => Promise<any>)[] = [];
  private running = false;

  async run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await task();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      this.triggerNext();
    });
  }

  private async triggerNext() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    const task = this.queue.shift()!;
    try {
      await task();
    } finally {
      this.running = false;
      this.triggerNext();
    }
  }
}
