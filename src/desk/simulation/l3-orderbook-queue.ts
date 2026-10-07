/**
 * Level-3 Price Level FIFO Queue
 * Maintains strict time-priority queue for an individual price level.
 *
 * @module desk/simulation/l3-orderbook-queue
 */

export interface QueueNode {
  orderId: string;
  size: number;
  timestampNs: bigint;
  prev?: QueueNode;
  next?: QueueNode;
}

export class L3OrderBookQueue {
  public readonly price: number;
  private head?: QueueNode;
  private tail?: QueueNode;
  private totalSizeCached = 0;
  private orderCountCached = 0;
  private readonly nodesByOrderId = new Map<string, QueueNode>();

  public constructor(price: number) {
    this.price = price;
  }

  public get totalSize(): number {
    return this.totalSizeCached;
  }

  public get orderCount(): number {
    return this.orderCountCached;
  }

  public addOrder(orderId: string, size: number, timestampNs: bigint): void {
    if (this.nodesByOrderId.has(orderId)) {
      this.cancelOrder(orderId);
    }
    const node: QueueNode = { orderId, size, timestampNs };
    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else if (this.tail) {
      this.tail.next = node;
      node.prev = this.tail;
      this.tail = node;
    }
    this.nodesByOrderId.set(orderId, node);
    this.totalSizeCached += size;
    this.orderCountCached += 1;
  }

  public cancelOrder(orderId: string): number {
    const node = this.nodesByOrderId.get(orderId);
    if (!node) return 0;
    this.removeNode(node);
    this.nodesByOrderId.delete(orderId);
    this.totalSizeCached -= node.size;
    this.orderCountCached -= 1;
    return node.size;
  }

  public modifyOrder(orderId: string, newSize: number): boolean {
    const node = this.nodesByOrderId.get(orderId);
    if (!node) return false;
    if (newSize <= node.size) {
      // Size reduction preserves priority
      const diff = node.size - newSize;
      node.size = newSize;
      this.totalSizeCached -= diff;
      return true;
    }
    // Size increase loses priority: cancel and re-append to tail
    this.cancelOrder(orderId);
    this.addOrder(orderId, newSize, node.timestampNs);
    return true;
  }

  public executeFromHead(fillSize: number): { executed: number; fullyFilled: boolean } {
    if (!this.head || fillSize <= 0) return { executed: 0, fullyFilled: false };
    const cur = this.head;
    if (cur.size <= fillSize) {
      const executed = cur.size;
      this.cancelOrder(cur.orderId);
      return { executed, fullyFilled: true };
    }
    cur.size -= fillSize;
    this.totalSizeCached -= fillSize;
    return { executed: fillSize, fullyFilled: false };
  }

  public getVolumeAhead(orderId: string): number {
    const target = this.nodesByOrderId.get(orderId);
    if (!target) return -1;
    let vol = 0;
    let cur = this.head;
    while (cur && cur !== target) {
      vol += cur.size;
      cur = cur.next;
    }
    return vol;
  }

  private removeNode(node: QueueNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    node.prev = undefined;
    node.next = undefined;
  }
}
