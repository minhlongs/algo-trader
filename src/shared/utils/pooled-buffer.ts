/**
 * Pooled buffer (Uint8Array wrapper with reset)
 */
export class PooledBuffer {
  private buffer: Uint8Array;

  constructor(size: number = 8192) {
    this.buffer = new Uint8Array(size);
  }

  getBuffer(): Uint8Array {
    return this.buffer;
  }

  getLength(): number {
    return this.buffer.length;
  }

  reset(): void {
    this.buffer.fill(0);
  }

  slice(start: number, end: number): Uint8Array {
    return this.buffer.slice(start, end);
  }
}
