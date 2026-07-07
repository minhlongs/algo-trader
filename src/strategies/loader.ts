/** Strategy loader — loads strategy implementations by ID. */
export class StrategyLoader {
  async loadStrategy(_strategyId: string): Promise<unknown> {
    // Stub: real implementation loads from file system or registry
    return null;
  }
}
