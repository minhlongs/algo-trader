export class KronosStrategy {
  private confidenceThreshold: number;
  private lookback: number;

  constructor(opts?: { confidenceThreshold?: number; lookback?: number }) {
    this.confidenceThreshold = opts?.confidenceThreshold ?? 0.6;
    this.lookback = opts?.lookback ?? 60;
  }
  getName(): string { return 'kronos'; }
  getStatus(): Record<string, unknown> { return { status: 'idle', confidenceThreshold: this.confidenceThreshold }; }
  async initialize(): Promise<void> { /* stub */ }
}
export default KronosStrategy;
