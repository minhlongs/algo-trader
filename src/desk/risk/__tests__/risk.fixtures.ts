import { vi, type Mock } from 'vitest';

export interface MockRedisType {
  hgetall: Mock;
  hset: Mock;
  get: Mock;
  set: Mock;
  del: Mock;
  keys: Mock;
  lpush: Mock;
  ltrim: Mock;
  lrange: Mock;
}

export const mockRedis: MockRedisType = {
  hgetall: vi.fn().mockResolvedValue({}),
  hset: vi.fn().mockResolvedValue(1),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  keys: vi.fn().mockResolvedValue([]),
  lpush: vi.fn().mockResolvedValue(1),
  ltrim: vi.fn().mockResolvedValue('OK'),
  lrange: vi.fn().mockResolvedValue([]),
};

export function resetMockRedis() {
  mockRedis.hgetall.mockReset().mockResolvedValue({});
  mockRedis.hset.mockReset().mockResolvedValue(1);
  mockRedis.get.mockReset().mockResolvedValue(null);
  mockRedis.set.mockReset().mockResolvedValue('OK');
  mockRedis.del.mockReset().mockResolvedValue(1);
  mockRedis.keys.mockReset().mockResolvedValue([]);
  mockRedis.lpush.mockReset().mockResolvedValue(1);
  mockRedis.ltrim.mockReset().mockResolvedValue('OK');
  mockRedis.lrange.mockReset().mockResolvedValue([]);
}
