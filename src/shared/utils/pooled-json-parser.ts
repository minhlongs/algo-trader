/**
 * Pooled JSON parser - resets buffer between uses
 */
export class PooledJSONParser {
  private buffer: string = '';

  parse(chunk: string): unknown[] {
    const items: unknown[] = [];
    const parts = (this.buffer + chunk).split('\n');

    // Last part may be incomplete
    this.buffer = parts.pop() || '';

    for (const part of parts) {
      if (part.trim()) {
        try {
          items.push(JSON.parse(part));
        } catch {
          // Skip malformed JSON
        }
      }
    }

    return items;
  }

  reset(): void {
    this.buffer = '';
  }
}
