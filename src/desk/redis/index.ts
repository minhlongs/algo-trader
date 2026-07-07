/** Redis client interface and stub factory. */
export interface RedisClientType {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  setex(key: string, ttl: number, value: string): Promise<void>;
  del(key: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  smembers(key: string): Promise<string[]>;
  sadd(key: string, ...members: string[]): Promise<number>;
  expire(key: string, ttl: number): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  ping(): Promise<string>;
  quit(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  isOpen: boolean;
}

let _client: RedisClientType | null = null;

export function getRedisClient(): RedisClientType {
  if (!_client) {
    _client = createStubClient();
  }
  return _client;
}

function createStubClient(): RedisClientType {
  const store = new Map<string, string>();
  const hashStore = new Map<string, Record<string, string>>();
  const setStore = new Map<string, Set<string>>();

  return {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, _ttl?: number): Promise<void> {
      store.set(key, value);
    },
    async setex(key: string, ttl: number, value: string): Promise<void> {
      store.set(key, value);
      setTimeout(() => store.delete(key), ttl * 1000);
    },
    async del(key: string): Promise<number> {
      return store.delete(key) ? 1 : 0;
    },
    async hset(key: string, field: string, value: string): Promise<number> {
      if (!hashStore.has(key)) hashStore.set(key, {});
      hashStore.get(key)![field] = value;
      return 1;
    },
    async hget(key: string, field: string): Promise<string | null> {
      return hashStore.get(key)?.[field] ?? null;
    },
    async hgetall(key: string): Promise<Record<string, string>> {
      return hashStore.get(key) ?? {};
    },
    async smembers(key: string): Promise<string[]> {
      return Array.from(setStore.get(key) ?? []);
    },
    async sadd(key: string, ...members: string[]): Promise<number> {
      if (!setStore.has(key)) setStore.set(key, new Set());
      let added = 0;
      for (const m of members) {
        if (setStore.get(key)!.add(m)) added++;
      }
      return added;
    },
    async expire(key: string, _ttl: number): Promise<number> {
      return store.has(key) ? 1 : 0;
    },
    async keys(pattern: string): Promise<string[]> {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(store.keys()).filter(k => regex.test(k));
    },
    async ping(): Promise<string> {
      return 'PONG';
    },
    async quit(): Promise<void> {
      store.clear();
      hashStore.clear();
      setStore.clear();
    },
    on(_event: string, _listener: (...args: unknown[]) => void): void {},
    get isOpen(): boolean {
      return true;
    },
  };
}
