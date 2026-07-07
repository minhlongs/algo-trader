/**
 * Event Bus
 * Lightweight publish/subscribe event bus for intra-process communication.
 */

type EventHandler = (payload: unknown) => void;

const handlers = new Map<string, Set<EventHandler>>();

export function on(event: string, handler: EventHandler): void {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(handler);
}

export function off(event: string, handler: EventHandler): void {
  handlers.get(event)?.delete(handler);
}

export async function emit(event: string, payload: unknown): Promise<void> {
  const set = handlers.get(event);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch { /* skip handler errors */ }
  }
}

export function once(event: string, handler: EventHandler): void {
  const wrapper: EventHandler = (p) => {
    off(event, wrapper);
    handler(p);
  };
  on(event, wrapper);
}

export function clearAll(): void {
  handlers.clear();
}
