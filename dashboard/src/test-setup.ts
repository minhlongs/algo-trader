/**
 * Vitest global test setup for the dashboard.
 * Extends vitest matchers with jest-dom assertions (toBeInTheDocument, etc.)
 * Provides in-memory Web Storage polyfills and DOM observer mocks.
 */
import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

class MemoryStorage implements Storage {
  private store: Map<string, string> = new Map();

  constructor() {
    this.clear = this.clear.bind(this);
    this.getItem = this.getItem.bind(this);
    this.key = this.key.bind(this);
    this.removeItem = this.removeItem.bind(this);
    this.setItem = this.setItem.bind(this);
  }

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  [name: string]: unknown;
}

const localStorageInstance = new MemoryStorage();
const sessionStorageInstance = new MemoryStorage();

// Polyfill window & globalThis localStorage / sessionStorage
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageInstance,
      writable: true,
      configurable: true,
    });
  } catch {
    (window as unknown as { localStorage: Storage }).localStorage = localStorageInstance;
  }

  try {
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorageInstance,
      writable: true,
      configurable: true,
    });
  } catch {
    (window as unknown as { sessionStorage: Storage }).sessionStorage = sessionStorageInstance;
  }
}

if (typeof globalThis !== 'undefined') {
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageInstance,
      writable: true,
      configurable: true,
    });
  } catch {
    (globalThis as unknown as { localStorage: Storage }).localStorage = localStorageInstance;
  }

  try {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: sessionStorageInstance,
      writable: true,
      configurable: true,
    });
  } catch {
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = sessionStorageInstance;
  }
}

// Polyfill ResizeObserver
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

// Polyfill matchMedia
if (typeof window !== 'undefined' && !window.matchMedia) {
  const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;
  globalThis.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;
}

// Polyfill IntersectionObserver
if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  class IntersectionObserverMock {
    root = null;
    rootMargin = '';
    thresholds = [];
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn().mockReturnValue([]);
  }
  window.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;
  globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;
}

// Reset storage before each test to maintain clean test isolation
beforeEach(() => {
  localStorageInstance.clear();
  sessionStorageInstance.clear();
});
