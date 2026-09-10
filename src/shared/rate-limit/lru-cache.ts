/**
 * In-Memory LRU Cache and Concurrency Mutex
 *
 * Provides a bounded doubly-linked list LRU cache and a FIFO async mutex
 * for serializing concurrent access without external locking primitives.
 *
 * @module shared/rate-limit/lru-cache
 */

export interface LRUNode<T> {
  key: string;
  entry: T;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
}

/**
 * Simple async mutex for serializing critical sections.
 * Ensures only one operation runs at a time with fair FIFO ordering.
 */
export class AsyncMutex {
  private queue: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];
  private locked = false;

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  private drain(): void {
    if (this.locked || this.queue.length === 0) return;
    this.locked = true;

    const item = this.queue.shift()!;

    void item.fn().then(
      (result) => {
        this.locked = false;
        item.resolve(result);
        this.drain();
      },
      (err) => {
        this.locked = false;
        item.reject(err);
        this.drain();
      },
    );
  }
}

/**
 * Doubly-linked list LRU Cache.
 * Evicts oldest items (tail) when maxEntries is exceeded.
 */
export class LRUCache<T> {
  private readonly map = new Map<string, LRUNode<T>>();
  private head: LRUNode<T> | null = null; // MRU end
  private tail: LRUNode<T> | null = null; // LRU end — eviction target

  constructor(public readonly maxEntries: number) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): LRUNode<T> | undefined {
    return this.map.get(key);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, entry: T): LRUNode<T> {
    let node = this.map.get(key);
    if (node) {
      node.entry = entry;
      this.moveToHead(node);
      return node;
    }

    node = {
      key,
      entry,
      prev: null,
      next: null,
    };
    this.map.set(key, node);
    this.moveToHead(node);
    this.evictIfFull();
    return node;
  }

  moveToHead(node: LRUNode<T>): void {
    if (this.head === node) return;

    if (node.prev) node.prev.next = node.next;
    else if (this.tail === node) this.tail = node.next;

    if (node.next) node.next.prev = node.prev;
    else if (this.tail === node) this.tail = node.prev;

    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  detachNode(node: LRUNode<T>): void {
    if (node.prev) node.prev.next = node.next;
    else if (this.head === node) this.head = node.next;

    if (node.next) node.next.prev = node.prev;
    else if (this.tail === node) this.tail = node.prev;
  }

  delete(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.detachNode(node);
    return this.map.delete(key);
  }

  evictIfFull(): void {
    while (this.map.size > this.maxEntries && this.tail) {
      const victim = this.tail;
      this.detachNode(victim);
      this.map.delete(victim.key);
    }
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  entries(): IterableIterator<[string, LRUNode<T>]> {
    return this.map.entries();
  }
}
